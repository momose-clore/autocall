import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth/password.ts";

// ローカル/検証用の初期データ投入（仕様書 60）。
// 実行: npm run db:seed（要 DATABASE_URL）
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // システム全体設定（シングルトン）
  await prisma.systemSetting.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  // 管理者アカウント
  const adminEmail = "admin@example.com";
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: "管理者",
      passwordHash: hashPassword("admin1234"),
      role: "ADMIN",
    },
    update: {},
  });

  // デモドライバー ＋ 起床設定 ＋ 当日シフト
  const driver = await prisma.driver.upsert({
    where: { id: "demo-driver-1" },
    create: {
      id: "demo-driver-1",
      name: "山田 太郎",
      phone: "090-0000-0000",
      phoneE164: "+819000000000",
      site: "デモ現場",
    },
    update: {},
  });

  await prisma.wakeupSetting.upsert({
    where: { driverId: driver.id },
    create: {
      driverId: driver.id,
      enabled: true,
      mode: "FIXED",
      fixedWakeupTime: "06:00",
    },
    update: {},
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startAt = new Date(today);
  startAt.setHours(8, 0, 0, 0);
  await prisma.shift.upsert({
    where: { driverId_workDate: { driverId: driver.id, workDate: today } },
    create: {
      driverId: driver.id,
      workDate: today,
      startAt,
      status: "SCHEDULED",
    },
    update: {},
  });

  // 管理者エスカレーション通知先（LINE）
  const targetValue = "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const exists = await prisma.adminNotificationTarget.findFirst({
    where: { value: targetValue },
  });
  if (!exists) {
    await prisma.adminNotificationTarget.create({
      data: { name: "現場責任者", type: "LINE", value: targetValue },
    });
  }

  console.log("✅ seed 完了: SystemSetting / admin@example.com(pw: admin1234) / デモドライバー・シフト");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
