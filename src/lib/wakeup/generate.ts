import { prisma } from "@/lib/prisma";
import {
  WakeupMode,
  WakeupStatus,
  ShiftStatus,
} from "@/generated/prisma/client";
import { getSystemSetting } from "@/lib/settings";
import { jstDateAtTime, jstDateOnly, addMinutes } from "@/lib/time";

export interface GenerateResult {
  targetDate: string;
  created: number;
  skipped: number;
  reasons: Record<string, number>;
}

/**
 * 指定日の起床セッションを事前生成する（仕様書 31）。
 * - シフトが SCHEDULED のドライバーのみ対象。休日/欠勤/取消は生成しない（仕様書 19）。
 * - wakeup 有効なドライバーのみ。
 * - 既存セッションがあれば重複生成しない（unique driverId+targetDate）。
 */
export async function generateSessionsForDate(day: Date): Promise<GenerateResult> {
  const system = await getSystemSetting();
  const targetDate = jstDateOnly(day); // JST カレンダー日（@db.Date 用・UTC深夜）
  const reasons: Record<string, number> = {};
  const bump = (k: string) => (reasons[k] = (reasons[k] || 0) + 1);

  const shifts = await prisma.shift.findMany({
    where: { workDate: targetDate },
    include: { driver: { include: { wakeupSetting: true } } },
  });

  let created = 0;
  let skipped = 0;

  for (const shift of shifts) {
    const driver = shift.driver;
    const setting = driver.wakeupSetting;

    if (!driver.isActive) {
      skipped++; bump("driver_inactive"); continue;
    }
    if (shift.status !== ShiftStatus.SCHEDULED) {
      // 休日・欠勤・稼働取消はセッションを作らない（仕様書 19）
      skipped++; bump("shift_not_scheduled"); continue;
    }
    if (system.skipHolidays === false) {
      // skipHolidays が false でも HOLIDAY 以外は上で弾いている
    }
    if (!setting || !setting.enabled) {
      skipped++; bump("wakeup_disabled"); continue;
    }

    // 起床予定時刻の算出（仕様書 18）
    let scheduledWakeupAt: Date;
    if (setting.mode === WakeupMode.FIXED) {
      scheduledWakeupAt = jstDateAtTime(targetDate, setting.fixedWakeupTime || "06:00");
    } else {
      scheduledWakeupAt = addMinutes(shift.startAt, -(setting.minutesBeforeShift ?? 90));
    }

    try {
      await prisma.wakeupSession.create({
        data: {
          driverId: driver.id,
          shiftId: shift.id,
          targetDate,
          scheduledWakeupAt,
          status: WakeupStatus.WAITING,
        },
      });
      created++;
    } catch {
      // unique 制約違反 = 既に存在。重複生成しない。
      skipped++; bump("already_exists");
    }
  }

  return {
    targetDate: targetDate.toISOString().slice(0, 10),
    created,
    skipped,
    reasons,
  };
}
