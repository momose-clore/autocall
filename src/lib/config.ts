// 環境変数の集約。未設定でもクラッシュせず、機能ごとに「利用可否」を返す（仕様書 61）。

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
  appBaseUrl: (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
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
