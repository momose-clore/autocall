import { env } from "@/lib/config";

// Cron エンドポイントの認証（仕様書 38）。
// Vercel Cron は Authorization: Bearer <CRON_SECRET> を付与できる。
// 手動実行や外部スケジューラ用に ?secret= / x-cron-secret ヘッダも許可する。
export function isAuthorizedCron(req: Request): boolean {
  if (!env.cronSecret) {
    // 未設定時は開発環境のみ許可（本番では必ず設定する）
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${env.cronSecret}`) return true;
  if (req.headers.get("x-cron-secret") === env.cronSecret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === env.cronSecret) return true;
  return false;
}
