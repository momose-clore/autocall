// 環境変数の集約。未設定でもクラッシュせず、機能ごとに「利用可否」を返す（仕様書 61）。

/**
 * Twilio/LINE の Webhook 絶対URL生成に使うベースURLを決める。
 * 優先: APP_BASE_URL（明示）→ VERCEL_PROJECT_PRODUCTION_URL（本番固定ドメイン）
 *      → VERCEL_URL（当該デプロイ自身の公開URL）→ localhost。
 * プレビューURLは毎回変わるため、明示指定が無ければデプロイ自身のURLを使う。
 */
function resolveBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export const env = {
  databaseUrl: process.env.DATABASE_URL || "",
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
  },
  line: {
    accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
    channelSecret: process.env.LINE_CHANNEL_SECRET || "",
  },
  cronSecret: process.env.CRON_SECRET || "",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || "dev-insecure-secret",
  appBaseUrl: resolveBaseUrl(),
  testMode: (process.env.WAKEUP_TEST_MODE || "true").toLowerCase() === "true",
  testAllowPhones: (process.env.TEST_ALLOW_PHONES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  testAllowLineUserIds: (process.env.TEST_ALLOW_LINE_USER_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function isTwilioConfigured(): boolean {
  return !!(env.twilio.accountSid && env.twilio.authToken && env.twilio.phoneNumber);
}

export function isLineConfigured(): boolean {
  return !!(env.line.accessToken && env.line.channelSecret);
}
