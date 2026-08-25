import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { generateSessionsForDate } from "@/lib/wakeup/generate";

// 当日（および指定日）の起床セッションを事前生成する（仕様書 31）。
// 通常は前日夜〜早朝に Vercel Cron で1回実行する。
// ?date=YYYY-MM-DD で対象日を指定可能（省略時は当日 JST）。
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const day = dateParam ? new Date(`${dateParam}T00:00:00+09:00`) : new Date();
    if (Number.isNaN(day.getTime())) {
      return NextResponse.json({ error: "invalid date" }, { status: 400 });
    }
    const result = await generateSessionsForDate(day);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/generate] failed", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
