import { prisma } from "@/lib/prisma";
import { formatJst } from "@/lib/time";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

// 操作ログ（誰が・いつ・何を・対象・変更前後）を新しい順に表示（仕様書 43）。
export default async function LogsPage() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">操作ログ</h1>
        <p className="text-sm text-muted-foreground">
          直近 200 件（新しい順）
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">監査ログ</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              ログはまだありません。
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日時</TableHead>
                  <TableHead>実行者</TableHead>
                  <TableHead>操作</TableHead>
                  <TableHead>対象</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {formatJst(l.createdAt, "MM/dd HH:mm:ss")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.actorName ?? "システム"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.targetType
                        ? `${l.targetType}${l.targetId ? `#${l.targetId.slice(0, 8)}` : ""}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
