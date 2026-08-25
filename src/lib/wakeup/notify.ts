import { prisma } from "@/lib/prisma";
import { notificationProvider } from "@/lib/providers/line";

// 管理者エスカレーション通知（複数登録可・仕様書 9）。
// LINE のみ実送信。EMAIL/PHONE は将来拡張（ここではログのみ）。
export async function notifyAdmins(text: string): Promise<void> {
  const targets = await prisma.adminNotificationTarget.findMany({
    where: { isActive: true },
  });
  for (const t of targets) {
    try {
      if (t.type === "LINE") {
        await notificationProvider.pushText(t.value, text);
      } else {
        console.log(`[admin-notify:${t.type}] ${t.value}: ${text}`);
      }
    } catch (e) {
      console.error("[notifyAdmins] failed", t.id, e);
    }
  }
}
