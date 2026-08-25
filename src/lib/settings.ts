import { prisma } from "@/lib/prisma";
import type { SystemSetting } from "@/generated/prisma/client";

// system_settings シングルトン（id=1）を取得。無ければデフォルトで作成。
export async function getSystemSetting(): Promise<SystemSetting> {
  const existing = await prisma.systemSetting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.systemSetting.create({ data: { id: 1 } });
}

export async function updateSystemSetting(
  data: Partial<Omit<SystemSetting, "id" | "updatedAt">>,
): Promise<SystemSetting> {
  // 最低発信間隔はシステム下限 60 秒を強制（仕様書 46）
  const patch = { ...data };
  if (patch.minCallIntervalSeconds != null) {
    patch.minCallIntervalSeconds = Math.max(60, patch.minCallIntervalSeconds);
  }
  return prisma.systemSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...patch },
    update: patch,
  });
}
