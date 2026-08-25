import { prisma } from "@/lib/prisma";
import { getSystemSetting } from "@/lib/settings";
import { jstStartOfDay, formatJst, formatJstTime } from "@/lib/time";
import { statusLabel, statusVariant } from "@/lib/wakeup/status-label";
import { WakeupStatus } from "@/generated/prisma/client";
import {
  confirmSessionAction,
  cancelSessionAction,
  runTickAction,
  generateTodayAction,
  toggleEmergencyStopAction,
} from "./actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const ACTIVE = new Set<WakeupStatus>([
  WakeupStatus.WAITING,
  WakeupStatus.CALLING,
  WakeupStatus.OVERDUE,
]);

export default async function DashboardPage() {
  const system = await getSystemSetting();
  const today = jstStartOfDay(new Date());

  const sessions = await prisma.wakeupSession.findMany({
    where: { targetDate: today },
    include: { driver: true },
    orderBy: { scheduledWakeupAt: "asc" },
  });

  const summary = {
    total: sessions.length,
    confirmed: sessions.filter((s) => s.status === WakeupStatus.CONFIRMED).length,
    active: sessions.filter((s) => ACTIVE.has(s.status)).length,
    overdue: sessions.filter((s) => s.status === WakeupStatus.OVERDUE).length,
    failed: sessions.filter((s) => s.status === WakeupStatus.FAILED).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground">
            {formatJst(today, "yyyy年M月d日")} の起床確認
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={generateTodayAction}>
            <Button type="submit" variant="outline" size="sm">
              当日分を生成
            </Button>
          </form>
          <form action={runTickAction}>
            <Button type="submit" variant="outline" size="sm">
              今すぐ実行（tick）
            </Button>
          </form>
          <form action={toggleEmergencyStopAction}>
            <input
              type="hidden"
              name="value"
              value={(!system.emergencyStop).toString()}
            />
            <Button
              type="submit"
              variant={system.emergencyStop ? "default" : "destructive"}
              size="sm"
            >
              {system.emergencyStop ? "緊急停止を解除" : "緊急停止"}
            </Button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="対象" value={summary.total} />
        <StatCard label="確認中/待機" value={summary.active} />
        <StatCard label="起床済" value={summary.confirmed} />
        <StatCard label="起床遅延" value={summary.overdue} tone="warn" />
        <StatCard label="確認失敗" value={summary.failed} tone="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">本日のセッション</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              本日の起床セッションはありません。「当日分を生成」で作成できます。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ドライバー</TableHead>
                  <TableHead>起床予定</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead className="text-right">LINE</TableHead>
                  <TableHead className="text-right">電話</TableHead>
                  <TableHead>確認</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => {
                  const active = ACTIVE.has(s.status);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.driver.name}
                        {s.driver.site ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {s.driver.site}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono">
                        {formatJstTime(s.scheduledWakeupAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(s.status)}>
                          {statusLabel(s.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {s.lineCount}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {s.callCount}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {s.confirmedAt
                          ? `${formatJstTime(s.confirmedAt)} / ${s.confirmationMethod ?? ""}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {active ? (
                            <>
                              <form action={confirmSessionAction}>
                                <input type="hidden" name="sessionId" value={s.id} />
                                <Button type="submit" size="sm" variant="secondary">
                                  起床確認
                                </Button>
                              </form>
                              <form action={cancelSessionAction}>
                                <input type="hidden" name="sessionId" value={s.id} />
                                <Button type="submit" size="sm" variant="ghost">
                                  対象外
                                </Button>
                              </form>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "danger";
}) {
  const color =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-500"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
