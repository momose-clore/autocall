import * as line from "@line/bot-sdk";
import { env, isLineConfigured } from "@/lib/config";
import type {
  NotificationProvider,
  NotifyResult,
  WakeupLineParams,
} from "./types";

// LINE Messaging API 実装（仕様書 4, 23, 52, 57）。
export class LineNotificationProvider implements NotificationProvider {
  private client() {
    return new line.messagingApi.MessagingApiClient({
      channelAccessToken: env.line.accessToken,
    });
  }

  private isAllowed(lineUserId: string): boolean {
    if (!env.testMode) return true;
    return env.testAllowLineUserIds.includes(lineUserId);
  }

  async sendWakeupMessage(params: WakeupLineParams): Promise<NotifyResult> {
    if (!isLineConfigured()) {
      return { ok: false, errorCode: "NOT_CONFIGURED", errorMessage: "LINE 未設定" };
    }
    if (!this.isAllowed(params.lineUserId)) {
      return { ok: true, skipped: true };
    }
    const scheduled = params.scheduledLabel ? `\n起床予定：${params.scheduledLabel}` : "";
    // Postback で本人性を検証できるよう sessionId を data に含める（仕様書 23）
    const message: line.messagingApi.Message = {
      type: "template",
      altText: "【起床確認】起床している場合はボタンを押してください",
      template: {
        type: "buttons",
        title: "起床確認",
        text: `おはようございます。\n本日の起床確認です。${scheduled}`,
        actions: [
          {
            type: "postback",
            label: "起床しました",
            data: `action=wakeup_confirm&sessionId=${params.sessionId}`,
            displayText: "起床しました",
          },
        ],
      },
    };
    try {
      const res = await this.client().pushMessage({
        to: params.lineUserId,
        messages: [message],
      });
      return { ok: true, referenceId: res.sentMessages?.[0]?.id };
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      return {
        ok: false,
        errorCode: err.statusCode != null ? String(err.statusCode) : "LINE_ERROR",
        errorMessage: err.message ?? "LINE 送信に失敗しました",
      };
    }
  }

  async pushText(lineUserId: string, text: string): Promise<NotifyResult> {
    if (!isLineConfigured()) {
      return { ok: false, errorCode: "NOT_CONFIGURED" };
    }
    if (!this.isAllowed(lineUserId)) {
      return { ok: true, skipped: true };
    }
    try {
      const res = await this.client().pushMessage({
        to: lineUserId,
        messages: [{ type: "text", text }],
      });
      return { ok: true, referenceId: res.sentMessages?.[0]?.id };
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      return {
        ok: false,
        errorCode: err.statusCode != null ? String(err.statusCode) : "LINE_ERROR",
        errorMessage: err.message ?? "LINE 送信に失敗しました",
      };
    }
  }
}

export const notificationProvider: NotificationProvider =
  new LineNotificationProvider();
