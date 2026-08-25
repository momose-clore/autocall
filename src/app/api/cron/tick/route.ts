import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { processTick } from "@/lib/wakeup/tick";

// 起床確認スケジューラの定期実行（毎分）。Vercel Cron から呼ばれる（仕様書 38/47）。
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processTick(new Date());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/tick] failed", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
