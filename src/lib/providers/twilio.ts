import twilio from "twilio";
import { env, isTwilioConfigured } from "@/lib/config";
import type { CallProvider, CallResult, WakeupCallParams } from "./types";

// Twilio Programmable Voice 実装（仕様書 24-27, 30, 52, 57）。
export class TwilioCallProvider implements CallProvider {
  private client() {
    return twilio(env.twilio.accountSid, env.twilio.authToken);
  }

  /** テストモードで発信を許可するか（仕様書 57: 本番番号へ誤発信しない） */
  private isAllowed(toE164: string): boolean {
    if (!env.testMode) return true;
    return env.testAllowPhones.includes(toE164);
  }

  async makeWakeupCall(params: WakeupCallParams): Promise<CallResult> {
    if (!isTwilioConfigured()) {
      return { ok: false, errorCode: "NOT_CONFIGURED", errorMessage: "Twilio 未設定" };
    }
    if (!this.isAllowed(params.toE164)) {
      // テストモード: 許可番号以外はスキップ（実発信しない）
      return { ok: true, skipped: true, status: "test-skipped" };
    }
    const base = env.appBaseUrl;
    const voiceUrl = `${base}/api/integrations/twilio/voice?sessionId=${encodeURIComponent(params.sessionId)}`;
    const statusUrl = `${base}/api/integrations/twilio/status?sessionId=${encodeURIComponent(params.sessionId)}`;
    try {
      const call = await this.client().calls.create({
        to: params.toE164,
        from: env.twilio.phoneNumber,
        url: voiceUrl,
        method: "POST",
        statusCallback: statusUrl,
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        // 無応答対策: 30秒で切る
        timeout: 30,
      });
      return { ok: true, referenceId: call.sid, status: call.status };
    } catch (e) {
      const err = e as { code?: string | number; message?: string };
      return {
        ok: false,
        errorCode: err.code != null ? String(err.code) : "TWILIO_ERROR",
        errorMessage: err.message ?? "発信に失敗しました",
      };
    }
  }

  async cancelCall(referenceId: string): Promise<void> {
    if (!isTwilioConfigured()) return;
    try {
      await this.client().calls(referenceId).update({ status: "completed" });
    } catch (e) {
      console.error("[twilio] cancelCall failed", e);
    }
  }

  async getCallStatus(referenceId: string): Promise<string | null> {
    if (!isTwilioConfigured()) return null;
    try {
      const call = await this.client().calls(referenceId).fetch();
      return call.status;
    } catch {
      return null;
    }
  }
}

export const callProvider: CallProvider = new TwilioCallProvider();
