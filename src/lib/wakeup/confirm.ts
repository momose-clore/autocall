import { prisma } from "@/lib/prisma";
import {
  WakeupStatus,
  ConfirmationMethod,
  AttemptType,
  AttemptProvider,
  AttemptStatus,
} from "@/generated/prisma/client";
import { callProvider } from "@/lib/providers/twilio";
import { writeAudit } from "@/lib/audit";

export interface ConfirmContext {
  actorId?: string | null;
  actorName?: string | null;
}

/**
 * 起床確定処理（仕様書 6）。
 * いずれか（LINEボタン / 電話で1 / 管理者手動）が成立した瞬間に呼ぶ。
 * - status = CONFIRMED、confirmedAt / confirmationMethod をセット
 * - 以降の再通知・再架電・エスカレーションを停止（next_call_at / next_line_at を null）
 * - 進行中の通話があれば Twilio 側も終了する（仕様書 30）
 *
 * 競合対策として updateMany の条件付き更新で「まだ確定していない」場合のみ確定する（冪等）。
 */
export async function confirmSession(
  sessionId: string,
  method: ConfirmationMethod,
  ctx: ConfirmContext = {},
): Promise<{ confirmed: boolean; alreadyConfirmed: boolean }> {
  const now = new Date();

  const claim = await prisma.wakeupSession.updateMany({
    where: {
      id: sessionId,
      confirmedAt: null,
      status: { notIn: [WakeupStatus.CANCELLED] },
    },
    data: {
      status: WakeupStatus.CONFIRMED,
      confirmedAt: now,
      confirmationMethod: method,
      nextCallAt: null,
      nextLineAt: null,
    },
  });

  if (claim.count !== 1) {
    // 既に確定済み or 対象外
    const existing = await prisma.wakeupSession.findUnique({ where: { id: sessionId } });
    return { confirmed: false, alreadyConfirmed: existing?.status === WakeupStatus.CONFIRMED };
  }

  // 進行中の通話を終了（仕様書 30）
  const inflight = await prisma.wakeupAttempt.findFirst({
    where: {
      wakeupSessionId: sessionId,
      type: AttemptType.PHONE_CALL,
      status: { in: [AttemptStatus.QUEUED, AttemptStatus.INITIATED, AttemptStatus.RINGING, AttemptStatus.IN_PROGRESS] },
      providerReferenceId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (inflight?.providerReferenceId) {
    await callProvider.cancelCall(inflight.providerReferenceId);
  }

  await prisma.wakeupAttempt.create({
    data: {
      wakeupSessionId: sessionId,
      type: AttemptType.ADMIN_NOTIFICATION,
      provider: AttemptProvider.INTERNAL,
      status: AttemptStatus.COMPLETED,
      metadata: { event: "confirmed", method },
    },
  });

  await writeAudit({
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    action: "wakeup.confirm",
    targetType: "WakeupSession",
    targetId: sessionId,
    after: { method },
  });

  return { confirmed: true, alreadyConfirmed: false };
}

/**
 * 本日の起床確認を停止する（対象外化・仕様書 15）。
 * status = CANCELLED、以降の通知・架電・エスカレーションを止める。
 */
export async function cancelSession(
  sessionId: string,
  ctx: ConfirmContext = {},
): Promise<void> {
  const now = new Date();
  await prisma.wakeupSession.updateMany({
    where: { id: sessionId, confirmedAt: null },
    data: {
      status: WakeupStatus.CANCELLED,
      cancelledAt: now,
      nextCallAt: null,
      nextLineAt: null,
    },
  });
  const inflight = await prisma.wakeupAttempt.findFirst({
    where: {
      wakeupSessionId: sessionId,
      type: AttemptType.PHONE_CALL,
      status: { in: [AttemptStatus.QUEUED, AttemptStatus.INITIATED, AttemptStatus.RINGING, AttemptStatus.IN_PROGRESS] },
      providerReferenceId: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (inflight?.providerReferenceId) {
    await callProvider.cancelCall(inflight.providerReferenceId);
  }
  await writeAudit({
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    action: "wakeup.cancel",
    targetType: "WakeupSession",
    targetId: sessionId,
  });
}
