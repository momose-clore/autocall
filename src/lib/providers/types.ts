// 外部サービス抽象化（仕様書 52）。
// Twilio / LINE へ直接依存しすぎないよう、業務ロジックはこの interface のみに依存する。
// 将来別の電話 API / 通知チャネルへ差し替え可能にする。

export interface CallResult {
  ok: boolean;
  /** Twilio Call SID 等 */
  referenceId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  /** テストモードでスキップした場合 true */
  skipped?: boolean;
}

export interface NotifyResult {
  ok: boolean;
  referenceId?: string;
  errorCode?: string;
  errorMessage?: string;
  skipped?: boolean;
}

export interface WakeupCallParams {
  /** 発信先 E.164 */
  toE164: string;
  /** 起床セッションID（TwiML コールバックで参照） */
  sessionId: string;
  /** ドライバー表示名（ログ用） */
  driverName?: string;
}

export interface CallProvider {
  /** 起床確認の自動電話を発信する */
  makeWakeupCall(params: WakeupCallParams): Promise<CallResult>;
  /** 進行中の通話を終了する（起床確認と競合したとき・仕様書 30） */
  cancelCall(referenceId: string): Promise<void>;
  /** 通話ステータスを取得する */
  getCallStatus(referenceId: string): Promise<string | null>;
}

export interface WakeupLineParams {
  lineUserId: string;
  sessionId: string;
  driverName?: string;
  /** 起床予定表示（"06:00"） */
  scheduledLabel?: string;
}

export interface NotificationProvider {
  /** 起床確認 LINE（ボタン付き Flex/Template）を送信する */
  sendWakeupMessage(params: WakeupLineParams): Promise<NotifyResult>;
  /** 任意テキストを push（管理者エスカレーション等） */
  pushText(lineUserId: string, text: string): Promise<NotifyResult>;
}
