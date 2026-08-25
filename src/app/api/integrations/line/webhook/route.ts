import { NextResponse } from "next/server";
import * as line from "@line/bot-sdk";
import { prisma } from "@/lib/prisma";
import { env, isLineConfigured } from "@/lib/config";
import { confirmSession } from "@/lib/wakeup/confirm";
import { notificationProvider } from "@/lib/providers/line";
import { ConfirmationMethod } from "@/generated/prisma/client";

// LINE Messaging API Webhook（仕様書 22/23）。
// - postback: 「起床しました」ボタン → 起床確認を確定
// - message(6桁数字): 連携コード認証 → ドライバーと LINE アカウントを紐付け
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isLineConfigured()) {
    return NextResponse.json({ ok: false, error: "LINE not configured" }, { status: 200 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  if (!line.validateSignature(raw, env.line.channelSecret, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  let body: { events?: line.webhook.Event[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  for (const event of body.events ?? []) {
    try {
      await handleEvent(event);
    } catch (e) {
      console.error("[line/webhook] event failed", e);
    }
  }

  // LINE には常に 200 を返す（再送ループ防止）
  return NextResponse.json({ ok: true });
}

async function handleEvent(event: line.webhook.Event): Promise<void> {
  // ── 起床確認ボタン（postback）──
  if (event.type === "postback") {
    const params = new URLSearchParams(event.postback.data);
    if (params.get("action") === "wakeup_confirm") {
      const sessionId = params.get("sessionId");
      const lineUserId = event.source?.userId;
      if (!sessionId) return;
      // 本人性検証: 押した LINE ユーザーがそのセッションのドライバー本人か（仕様書 23）
      if (lineUserId && !(await isSessionOwner(sessionId, lineUserId))) {
        return;
      }
      await confirmSession(sessionId, ConfirmationMethod.LINE);
      if (lineUserId) {
        await notificationProvider.pushText(
          lineUserId,
          "起床確認を受け付けました。本日もお気をつけて。",
        );
      }
    }
    return;
  }

  // ── 連携コード認証（テキストメッセージ）──
  if (event.type === "message" && event.message.type === "text") {
    const text = event.message.text.trim();
    const lineUserId = event.source?.userId;
    if (!lineUserId) return;
    if (/^\d{6}$/.test(text)) {
      await tryLinkAccount(text, lineUserId);
    }
  }
}

/** そのセッションが指定 LINE ユーザーのドライバーのものか判定する。 */
async function isSessionOwner(sessionId: string, lineUserId: string): Promise<boolean> {
  const session = await prisma.wakeupSession.findUnique({
    where: { id: sessionId },
    select: {
      driver: { select: { lineAccounts: { where: { lineUserId, isActive: true } } } },
    },
  });
  return (session?.driver.lineAccounts.length ?? 0) > 0;
}

/** 6桁連携コードを検証し、ドライバーと LINE アカウントを紐付ける（仕様書 22）。 */
async function tryLinkAccount(code: string, lineUserId: string): Promise<void> {
  const now = new Date();
  const link = await prisma.lineLinkCode.findUnique({ where: { code } });

  const reply = async (t: string) =>
    notificationProvider.pushText(lineUserId, t);

  if (!link || link.usedAt || link.expiresAt < now) {
    await reply("連携コードが無効か、有効期限切れです。管理者にお問い合わせください。");
    return;
  }

  await prisma.$transaction([
    prisma.lineLinkCode.update({
      where: { id: link.id },
      data: { usedAt: now },
    }),
    prisma.driverLineAccount.upsert({
      where: { lineUserId },
      create: {
        driverId: link.driverId,
        lineUserId,
        isActive: true,
      },
      update: { driverId: link.driverId, isActive: true },
    }),
  ]);

  await reply("LINE 連携が完了しました。今後こちらから起床確認をお送りします。");
}
