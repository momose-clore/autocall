"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require";
import { destroySession } from "@/lib/auth/session";
import { confirmSession, cancelSession } from "@/lib/wakeup/confirm";
import { processTick } from "@/lib/wakeup/tick";
import { updateSystemSetting } from "@/lib/settings";
import { writeAudit } from "@/lib/audit";
import { generateSessionsForDate } from "@/lib/wakeup/generate";
import { ConfirmationMethod } from "@/generated/prisma/client";
import { addMinutes } from "@/lib/time";

// ── 認証 ──
export async function logout() {
  await destroySession();
  redirect("/login");
}

// ── セッション操作（仕様書 6/15）──
export async function confirmSessionAction(formData: FormData) {
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId) {
    await confirmSession(sessionId, ConfirmationMethod.ADMIN, {
      actorId: user.id,
      actorName: user.name,
    });
  }
  revalidatePath("/admin");
}

export async function cancelSessionAction(formData: FormData) {
  const user = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (sessionId) {
    await cancelSession(sessionId, { actorId: user.id, actorName: user.name });
  }
  revalidatePath("/admin");
}

// ── 手動でスケジューラを回す（検証用）──
export async function runTickAction() {
  await requireUser();
  await processTick(new Date());
  revalidatePath("/admin");
}

// ── 当日セッションを生成（検証用）──
export async function generateTodayAction() {
  const user = await requireUser();
  const res = await generateSessionsForDate(new Date());
  await writeAudit({
    actorId: user.id,
    actorName: user.name,
    action: "wakeup.generate",
    targetType: "WakeupSession",
    after: res,
  });
  revalidatePath("/admin");
}

// ── 緊急停止トグル（仕様書 45）──
export async function toggleEmergencyStopAction(formData: FormData) {
  const user = await requireUser();
  const on = String(formData.get("value") ?? "") === "true";
  const before = await prisma.systemSetting.findUnique({ where: { id: 1 } });
  await updateSystemSetting({ emergencyStop: on });
  await writeAudit({
    actorId: user.id,
    actorName: user.name,
    action: "system.emergencyStop",
    targetType: "SystemSetting",
    targetId: "1",
    before: { emergencyStop: before?.emergencyStop },
    after: { emergencyStop: on },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
}

// ── システム設定更新（仕様書 35/45/46）──
export async function updateSettingsAction(formData: FormData) {
  const user = await requireUser();
  const num = (k: string) => {
    const v = formData.get(k);
    return v == null || v === "" ? undefined : Number(v);
  };
  const bool = (k: string) => formData.get(k) === "on";

  const before = await prisma.systemSetting.findUnique({ where: { id: 1 } });
  const patch = {
    wakeupEnabled: bool("wakeupEnabled"),
    lineEnabled: bool("lineEnabled"),
    phoneEnabled: bool("phoneEnabled"),
    adminLineNotify: bool("adminLineNotify"),
    skipHolidays: bool("skipHolidays"),
    defaultCallInterval: num("defaultCallInterval"),
    defaultLineInterval: num("defaultLineInterval"),
    escalationMinutes: num("escalationMinutes"),
    maxDurationMinutes: num("maxDurationMinutes"),
    minCallIntervalSeconds: num("minCallIntervalSeconds"),
    maxCallsPerPersonHour: num("maxCallsPerPersonHour"),
    maxCallsSystemHour: num("maxCallsSystemHour"),
    lineMonthlyQuota: num("lineMonthlyQuota"),
  };
  await updateSystemSetting(patch);
  await writeAudit({
    actorId: user.id,
    actorName: user.name,
    action: "system.updateSettings",
    targetType: "SystemSetting",
    targetId: "1",
    before: before ?? undefined,
    after: patch,
  });
  revalidatePath("/admin/settings");
}

// ── LINE 連携コード発行（6桁・有効期限10分・仕様書 22）──
export async function issueLinkCodeAction(formData: FormData) {
  const user = await requireUser();
  const driverId = String(formData.get("driverId") ?? "");
  if (!driverId) return;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.lineLinkCode.create({
    data: { code, driverId, expiresAt: addMinutes(new Date(), 10) },
  });
  await writeAudit({
    actorId: user.id,
    actorName: user.name,
    action: "line.issueLinkCode",
    targetType: "Driver",
    targetId: driverId,
  });
  revalidatePath("/admin/drivers");
}
