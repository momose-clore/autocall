import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AttemptStatus } from "@/generated/prisma/client";

// Twilio の通話ステータスコールバック（仕様書 27）。
// CallSid をキーに該当 Attempt のステータス・完了時刻を更新する。
export const dynamic = "force-dynamic";

const STATUS_MAP: Record<string, AttemptStatus> = {
  queued: AttemptStatus.QUEUED,
  initiated: AttemptStatus.INITIATED,
  ringing: AttemptStatus.RINGING,
  "in-progress": AttemptStatus.IN_PROGRESS,
  completed: AttemptStatus.COMPLETED,
  busy: AttemptStatus.BUSY,
  failed: AttemptStatus.FAILED,
  "no-answer": AttemptStatus.NO_ANSWER,
  canceled: AttemptStatus.CANCELED,
};

const TERMINAL = new Set<AttemptStatus>([
  AttemptStatus.COMPLETED,
  AttemptStatus.BUSY,
  AttemptStatus.FAILED,
  AttemptStatus.NO_ANSWER,
  AttemptStatus.CANCELED,
]);

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const callSid = (form?.get("CallSid") as string | null) ?? "";
  const callStatus = (form?.get("CallStatus") as string | null) ?? "";

  if (!callSid) {
    return NextResponse.json({ ok: false, error: "no CallSid" }, { status: 400 });
  }

  const mapped = STATUS_MAP[callStatus] ?? AttemptStatus.ERROR;
  const now = new Date();

  try {
    await prisma.wakeupAttempt.updateMany({
      where: { providerReferenceId: callSid },
      data: {
        status: mapped,
        completedAt: TERMINAL.has(mapped) ? now : undefined,
      },
    });
  } catch (e) {
    console.error("[twilio/status] update failed", e);
  }

  return NextResponse.json({ ok: true });
}
