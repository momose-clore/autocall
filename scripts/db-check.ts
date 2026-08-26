import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const cmd = process.argv[2] ?? "show";

async function show() {
  const shifts = await prisma.shift.findMany({ include: { driver: true } });
  console.log("── shifts ──");
  for (const s of shifts) {
    console.log(
      `${s.driver.name} workDate=${s.workDate.toISOString()} start=${s.startAt.toISOString()} status=${s.status}`,
    );
  }
  const sessions = await prisma.wakeupSession.findMany({
    include: { driver: true, attempts: true },
    orderBy: { createdAt: "asc" },
  });
  console.log("── wakeup_sessions ──");
  for (const s of sessions) {
    console.log(
      `id=${s.id.slice(0, 8)} ${s.driver.name} targetDate=${s.targetDate.toISOString()} ` +
        `scheduled=${s.scheduledWakeupAt.toISOString()} status=${s.status} ` +
        `line=${s.lineCount} call=${s.callCount} confirmedAt=${s.confirmedAt?.toISOString() ?? "-"} ` +
        `method=${s.confirmationMethod ?? "-"} attempts=${s.attempts.length}`,
    );
  }
}

async function reset() {
  await prisma.wakeupAttempt.deleteMany({});
  await prisma.wakeupSession.deleteMany({});
  await prisma.shift.deleteMany({});
  console.log("✅ reset: wakeup_attempts / wakeup_sessions / shifts を削除");
}

// 最新セッションを「N分前に開始・確認中」の状態へ戻す（エスカレーション/打切り検証用）
async function age(minutes: number) {
  const s = await prisma.wakeupSession.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!s) return console.log("no session");
  const startedAt = new Date(Date.now() - minutes * 60_000);
  await prisma.wakeupSession.update({
    where: { id: s.id },
    data: {
      status: "CALLING",
      startedAt,
      confirmedAt: null,
      confirmationMethod: null,
      escalatedAt: null,
      nextCallAt: null,
      nextLineAt: null,
    },
  });
  console.log(`✅ ${s.id.slice(0, 8)} を ${minutes} 分前開始・CALLING に設定`);
}

async function latestId() {
  const s = await prisma.wakeupSession.findFirst({
    orderBy: { createdAt: "desc" },
  });
  process.stdout.write((s?.id ?? "") + "\n");
}

async function main() {
  if (cmd === "reset") await reset();
  if (cmd === "id") {
    await latestId();
    return;
  }
  if (cmd === "age") {
    await age(Number(process.argv[3] ?? "20"));
    return;
  }
  await show();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
