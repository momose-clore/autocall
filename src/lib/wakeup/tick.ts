import { prisma } from "@/lib/prisma";
import {
  WakeupStatus,
  AttemptType,
  AttemptProvider,
  AttemptStatus,
} from "@/generated/prisma/client";
import { getSystemSetting } from "@/lib/settings";
import { resolveEffectiveSettings } from "./effective";
import { canPlaceCall, sendWakeupLine, sendWakeupCall } from "./send";
import { notifyAdmins } from "./notify";
import { diffMinutes, formatJst, formatJstTime } from "@/lib/time";

// 起床確認スケジューラ本体（仕様書 5/6/8/9/45/46）。
// Vercel Cron から毎分呼ばれ、対象セッションを次の状態へ進める。
// - WAITING: 起床予定時刻に到達 → CALLING に遷移し初回通知・発信
// - CALLING: 間隔ごとに LINE / 電話を再送、エスカレーション、最大継続で失敗停止
// - CONFIRMED / CANCELLED / FAILED: 対象外（confirm.ts / cancel で停止済み）

export interface TickResult {
  ranAt: string;
  processed: number;
  started: number;
  linesSent: number;
  callsPlaced: number;
  escalated: number;
  failed: number;
  skipped: Record<string, number>;
  emergencyStop?: boolean;
  disabled?: boolean;
}

/** 稼働中セッションを1件だけ include 付きで取得する型のためのヘルパ問い合わせ */
async function loadActiveSessions() {
  return prisma.wakeupSession.findMany({
    where: {
      status: { in: [WakeupStatus.WAITING, WakeupStatus.CALLING, WakeupStatus.OVERDUE] },
    },
    include: {
      driver: {
        include: {
          wakeupSetting: true,
          lineAccounts: { where: { isActive: true }, take: 1 },
        },
      },
    },
    orderBy: { scheduledWakeupAt: "asc" },
  });
}

type ActiveSession = Awaited<ReturnType<typeof loadActiveSessions>>[number];

export async function processTick(now: Date = new Date()): Promise<TickResult> {
  const system = await getSystemSetting();
  const result: TickResult = {
    ranAt: formatJst(now),
    processed: 0,
    started: 0,
    linesSent: 0,
    callsPlaced: 0,
    escalated: 0,
    failed: 0,
    skipped: {},
  };
  const bump = (k: string) => (result.skipped[k] = (result.skipped[k] || 0) + 1);

  // 緊急停止・全体無効なら何もしない（仕様書 45）
  if (system.emergencyStop) {
    return { ...result, emergencyStop: true };
  }
  if (!system.wakeupEnabled) {
    return { ...result, disabled: true };
  }

  const sessions = await loadActiveSessions();

  for (const session of sessions) {
    result.processed++;
    try {
      await processSession(session, system, now, result, bump);
    } catch (e) {
      console.error("[tick] session failed", session.id, e);
      bump("error");
    }
  }

  return result;
}

async function processSession(
  session: ActiveSession,
  system: Awaited<ReturnType<typeof getSystemSetting>>,
  now: Date,
  result: TickResult,
  bump: (k: string) => void,
): Promise<void> {
  const driver = session.driver;
  const effective = resolveEffectiveSettings(system, driver.wakeupSetting);
  const lineUserId = driver.lineAccounts[0]?.lineUserId ?? null;

  // ── WAITING: 起床予定時刻に到達したら開始 ──
  if (session.status === WakeupStatus.WAITING) {
    if (session.scheduledWakeupAt > now) {
      bump("not_due");
      return;
    }
    await prisma.wakeupSession.update({
      where: { id: session.id },
      data: { status: WakeupStatus.CALLING, startedAt: now },
    });
    session.status = WakeupStatus.CALLING;
    session.startedAt = now;
    result.started++;
    // 開始直後に初回 LINE / 電話（間隔条件は下の共通処理で満たされる）
  }

  const startedAt = session.startedAt ?? now;
  const elapsed = diffMinutes(now, startedAt);

  // ── 最大継続時間で打ち切り（仕様書 8）──
  if (elapsed >= effective.maxDurationMinutes) {
    await failSession(session.id, now);
    result.failed++;
    // 最終エスカレーション（まだなら）
    if (!session.escalatedAt) {
      await escalate(session, now, "max_duration");
      result.escalated++;
    } else {
      await notifyAdmins(
        `【起床未確認・打ち切り】${driver.name} さんの起床確認が ${effective.maxDurationMinutes} 分経過しても取れませんでした（${formatJst(now)}）。`,
      );
    }
    return;
  }

  // ── エスカレーション（仕様書 9）: 一定時間未確認で管理者通知（1回のみ）──
  if (
    system.adminLineNotify &&
    !session.escalatedAt &&
    elapsed >= effective.escalationMinutes
  ) {
    await escalate(session, now, "unconfirmed");
    session.escalatedAt = now;
    if (session.status !== WakeupStatus.OVERDUE) {
      await prisma.wakeupSession.update({
        where: { id: session.id },
        data: { status: WakeupStatus.OVERDUE },
      });
      session.status = WakeupStatus.OVERDUE;
    }
    result.escalated++;
    // エスカレーション後も確認が取れるまで発信は継続する
  }

  // ── LINE 再通知（仕様書 5）──
  if (effective.lineEnabled && lineUserId) {
    const dueLine = !session.nextLineAt || session.nextLineAt <= now;
    if (dueLine) {
      const r = await sendWakeupLine({
        sessionId: session.id,
        lineUserId,
        driverName: driver.name,
        scheduledWakeupAt: session.scheduledWakeupAt,
        now,
        effective,
      });
      if (r.ok) result.linesSent++;
      else bump("line_failed");
    }
  } else if (effective.lineEnabled && !lineUserId) {
    bump("no_line_account");
  }

  // ── 電話 再架電（仕様書 5/24/45/46）──
  if (effective.phoneEnabled) {
    const dueCall = !session.nextCallAt || session.nextCallAt <= now;
    if (dueCall) {
      if (!driver.phoneE164) {
        bump("no_phone");
      } else {
        const gate = await canPlaceCall({
          now,
          driverId: driver.id,
          system,
          effective,
          lastCallAt: session.lastCallAt,
        });
        if (!gate.ok) {
          bump(`call_gated_${gate.reason}`);
        } else {
          const r = await sendWakeupCall({
            sessionId: session.id,
            toE164: driver.phoneE164,
            driverName: driver.name,
            now,
            effective,
          });
          if (r.ok) result.callsPlaced++;
          else bump("call_failed");
        }
      }
    }
  }
}

/** 起床未確認としてセッションを失敗停止する（以降の通知・発信を止める）。 */
async function failSession(sessionId: string, now: Date): Promise<void> {
  await prisma.wakeupSession.updateMany({
    where: { id: sessionId, confirmedAt: null },
    data: {
      status: WakeupStatus.FAILED,
      nextCallAt: null,
      nextLineAt: null,
    },
  });
  await prisma.wakeupAttempt.create({
    data: {
      wakeupSessionId: sessionId,
      type: AttemptType.ADMIN_NOTIFICATION,
      provider: AttemptProvider.INTERNAL,
      status: AttemptStatus.COMPLETED,
      startedAt: now,
      completedAt: now,
      metadata: { event: "failed", reason: "max_duration" },
    },
  });
}

/** 管理者へエスカレーション通知し、escalatedAt を記録する（仕様書 9）。 */
async function escalate(
  session: ActiveSession,
  now: Date,
  reason: string,
): Promise<void> {
  const driver = session.driver;
  const scheduled = formatJstTime(session.scheduledWakeupAt);
  await notifyAdmins(
    `【起床未確認】${driver.name} さん（起床予定 ${scheduled}）の起床確認が取れていません。至急ご確認ください。（${formatJst(now)}）`,
  );
  await prisma.wakeupSession.update({
    where: { id: session.id },
    data: { escalatedAt: now },
  });
  await prisma.wakeupAttempt.create({
    data: {
      wakeupSessionId: session.id,
      type: AttemptType.ADMIN_NOTIFICATION,
      provider: AttemptProvider.INTERNAL,
      status: AttemptStatus.COMPLETED,
      startedAt: now,
      completedAt: now,
      metadata: { event: "escalated", reason },
    },
  });
}
