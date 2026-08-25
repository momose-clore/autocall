import twilio from "twilio";
import { confirmSession } from "@/lib/wakeup/confirm";
import { ConfirmationMethod } from "@/generated/prisma/client";

// 電話のプッシュ入力（DTMF）を受け取り、「1」なら起床確認を確定する（仕様書 6/26）。
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const form = await req.formData().catch(() => null);
  const digits = (form?.get("Digits") as string | null) ?? "";

  const twiml = new twilio.twiml.VoiceResponse();

  if (sessionId && digits === "1") {
    try {
      await confirmSession(sessionId, ConfirmationMethod.PHONE);
    } catch (e) {
      console.error("[twilio/gather] confirm failed", e);
    }
    twiml.say(
      { language: "ja-JP", voice: "Polly.Mizuki" },
      "起床確認が取れました。本日もお気をつけて。",
    );
  } else {
    twiml.say(
      { language: "ja-JP", voice: "Polly.Mizuki" },
      "確認が取れませんでした。改めてお電話します。",
    );
  }
  twiml.hangup();

  return new Response(twiml.toString(), {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}
