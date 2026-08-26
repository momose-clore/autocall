import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/auth/password.ts";
import { jstDateOnly, jstDateAtTime } from "../src/lib/time.ts";

// ローカル/検証用の初期データ投入（仕様書 60）。
// 実行: npm run db:seed（.env.local の DATABASE_URL を使用）
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

  // JST の当日カレンダー日（@db.Date 用）と JST 08:00 出勤
  const now = new Date();
  const workDate = jstDateOnly(now);
  const startAt = jstDateAtTime(now, "08:00");
  await prisma.shift.upsert({
    where: { driverId_workDate: { driverId: driver.id, workDate } },
    create: {
      driverId: driver.id,
      workDate,
      startAt,
      status: "SCHEDULED",
    },
    update: { startAt, status: "SCHEDULED" },
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
