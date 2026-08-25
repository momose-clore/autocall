import { prisma } from "@/lib/prisma";
import { issueLinkCodeAction } from "../actions";
import { formatJst } from "@/lib/time";
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

export default async function DriversPage() {
  const now = new Date();
  const drivers = await prisma.driver.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      wakeupSetting: true,
      lineAccounts: { where: { isActive: true } },
      linkCodes: {
        where: { usedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">ドライバー</h1>
        <p className="text-sm text-muted-foreground">
          起床設定・LINE 連携状況・連携コード発行（仕様書 17/22）
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            登録ドライバー（{drivers.length}）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {drivers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              ドライバーが登録されていません。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>氏名 / 現場</TableHead>
                  <TableHead>電話</TableHead>
                  <TableHead>起床</TableHead>
                  <TableHead>LINE</TableHead>
                  <TableHead>連携コード</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => {
                  const linked = d.lineAccounts.length > 0;
                  const setting = d.wakeupSetting;
                  const code = d.linkCodes[0];
                  return (
                    <TableRow key={d.id} className={d.isActive ? "" : "opacity-50"}>
                      <TableCell className="font-medium">
                        {d.name}
                        {d.site ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {d.site}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {d.phoneE164 ?? d.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {setting?.enabled
                          ? setting.mode === "FIXED"
                            ? `固定 ${setting.fixedWakeupTime ?? ""}`
                            : `出勤${setting.minutesBeforeShift}分前`
                          : "無効"}
                      </TableCell>
                      <TableCell>
                        {linked ? (
                          <Badge variant="outline">連携済</Badge>
                        ) : (
                          <Badge variant="secondary">未連携</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {code ? (
                          <span className="font-mono text-sm">
                            {code.code}
                            <span className="ml-2 text-xs text-muted-foreground">
                              〜{formatJst(code.expiresAt, "HH:mm")}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={issueLinkCodeAction}>
                          <input type="hidden" name="driverId" value={d.id} />
                          <Button type="submit" size="sm" variant="secondary">
                            連携コード発行
                          </Button>
                        </form>
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
