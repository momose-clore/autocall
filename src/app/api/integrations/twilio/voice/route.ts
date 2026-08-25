import twilio from "twilio";
import { env } from "@/lib/config";

// Twilio 発信時に読み上げる TwiML を返す（仕様書 25/26）。
// 「1」を押すと gather の action に POST され、起床確認が確定する。
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const base = env.appBaseUrl;

  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: `${base}/api/integrations/twilio/gather?sessionId=${encodeURIComponent(sessionId)}`,
    method: "POST",
    timeout: 10,
    language: "ja-JP",
  });
  gather.say(
    { language: "ja-JP", voice: "Polly.Mizuki" },
    "おはようございます。起床確認の自動電話です。起床している場合は、1を押してください。",
  );
  // 無入力時の再案内 → 応答なしとして切断（status callback 側で NO_ANSWER 扱い）
  twiml.say(
    { language: "ja-JP", voice: "Polly.Mizuki" },
    "確認が取れませんでした。改めてお電話します。",
  );

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const GET = handle;
export const POST = handle;
