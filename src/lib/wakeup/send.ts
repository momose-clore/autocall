import { prisma } from "@/lib/prisma";
import {
  AttemptType,
  AttemptProvider,
  AttemptStatus,
} from "@/generated/prisma/client";
import type { SystemSetting } from "@/generated/prisma/client";
import { callProvider } from "@/lib/providers/twilio";
import { notificationProvider } from "@/lib/providers/line";
import type { EffectiveSettings } from "./effective";
import { addMinutes, formatJstTime } from "@/lib/time";

// 起床確認の LINE / 電話 発信を「実行 → Attempt 記録 → セッションカウンタ更新」まで
// 一貫して行うヘルパ。tick エンジンから呼ぶ（仕様書 20/24/45/46）。

const ONE_HOUR_MS = 60 * 60 * 1000;

/** LINE push のステータス文字列 → AttemptStatus */
function lineStatus(ok: boolean, skipped?: boolean): AttemptStatus {
  if (skipped) return AttemptStatus.SENT; // テストスキップも「送達扱い」で記録
  return ok ? AttemptStatus.SENT : AttemptStatus.ERROR;
}

/** Twilio Call Status → AttemptStatus（初期発信時） */
function callInitialStatus(ok: boolean, skipped?: boolean): AttemptStatus {
  if (skipped) return AttemptStatus.COMPLETED;
  return ok ? AttemptStatus.QUEUED : AttemptStatus.ERROR;
}

/**
 * 発信可否をレート上限で判定する（仕様書 45/46）。
 * - システム全体 1時間あたり最大発信数
 * - 1人あたり 1時間あたり最大発信数
 * - 最低発信間隔（lastCallAt からの経過秒）
 */
export async function canPlaceCall(params: {
  now: Date;
  driverId: string;
  system: SystemSetting;
  effective: EffectiveSettings;
  lastCallAt: Date | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const { now, driverId, system, effective, lastCallAt } = params;
  const since = new Date(now.getTime() - ONE_HOUR_MS);

  if (lastCallAt) {
    const elapsedSec = (now.getTime() - lastCallAt.getTime()) / 1000;
    if (elapsedSec < effective.effectiveCallIntervalSeconds) {
      return { ok: false, reason: "min_interval" };
    }
  }

  const systemCount = await prisma.wakeupAttempt.count({
    where: { type: AttemptType.PHONE_CALL, createdAt: { gte: since } },
  });
  if (systemCount >= system.maxCallsSystemHour) {
    return { ok: false, reason: "system_hour_cap" };
  }

  const personCount = await prisma.wakeupAttempt.count({
    where: {
      type: AttemptType.PHONE_CALL,
      createdAt: { gte: since },
      session: { driverId },
    },
  });
  if (personCount >= system.maxCallsPerPersonHour) {
    return { ok: false, reason: "person_hour_cap" };
  }

  return { ok: true };
}

/** 起床確認 LINE を1通送り、Attempt 記録とセッションカウンタを更新する。 */
export async function sendWakeupLine(params: {
  sessionId: string;
  lineUserId: string;
  driverName?: string;
  scheduledWakeupAt: Date;
  now: Date;
  effective: EffectiveSettings;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const { sessionId, lineUserId, driverName, scheduledWakeupAt, now, effective } =
    params;

  const res = await notificationProvider.sendWakeupMessage({
    lineUserId,
    sessionId,
    driverName,
    scheduledLabel: formatJstTime(scheduledWakeupAt),
  });

  await prisma.wakeupAttempt.create({
    data: {
      wakeupSessionId: sessionId,
      type: AttemptType.LINE_PUSH,
      provider: AttemptProvider.LINE,
      status: lineStatus(res.ok, res.skipped),
      providerReferenceId: res.referenceId ?? null,
      startedAt: now,
      completedAt: now,
      errorCode: res.errorCode ?? null,
      errorMessage: res.errorMessage ?? null,
      metadata: res.skipped ? { skipped: true } : undefined,
    },
  });

  await prisma.wakeupSession.update({
    where: { id: sessionId },
    data: {
      lineCount: { increment: 1 },
      lastLineAt: now,
      nextLineAt: addMinutes(now, effective.lineIntervalMinutes),
    },
  });

  return { ok: res.ok, skipped: res.skipped };
}

/** 起床確認の自動電話を1回発信し、Attempt 記録とセッションカウンタを更新する。 */
export async function sendWakeupCall(params: {
  sessionId: string;
  toE164: string;
  driverName?: string;
  now: Date;
  effective: EffectiveSettings;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const { sessionId, toE164, driverName, now, effective } = params;

  const res = await callProvider.makeWakeupCall({
    toE164,
    sessionId,
    driverName,
  });

  await prisma.wakeupAttempt.create({
    data: {
      wakeupSessionId: sessionId,
      type: AttemptType.PHONE_CALL,
      provider: AttemptProvider.TWILIO,
      status: callInitialStatus(res.ok, res.skipped),
      providerReferenceId: res.referenceId ?? null,
      startedAt: now,
      completedAt: res.skipped ? now : null,
      errorCode: res.errorCode ?? null,
      errorMessage: res.errorMessage ?? null,
      metadata: res.skipped ? { skipped: true } : undefined,
    },
  });

  await prisma.wakeupSession.update({
    where: { id: sessionId },
    data: {
      callCount: { increment: 1 },
      lastCallAt: now,
      nextCallAt: addMinutes(now, effective.callIntervalMinutes),
    },
  });

  return { ok: res.ok, skipped: res.skipped };
}
