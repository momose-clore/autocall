import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth/require";
import { getSystemSetting } from "@/lib/settings";
import { AdminNav } from "./nav";
import { logout } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const system = await getSystemSetting();

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-border bg-card p-4 md:flex">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold">オートコール</p>
            <p className="text-xs text-muted-foreground">起床確認・自動架電</p>
          </div>
          <AdminNav />
        </div>
        <form action={logout}>
          <div className="mb-2 text-xs text-muted-foreground">
            {user.name}（{user.role}）
          </div>
          <Button type="submit" variant="outline" size="sm" className="w-full">
            ログアウト
          </Button>
        </form>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="md:hidden">
            <AdminNav />
          </div>
          <div className="ml-auto">
            {system.emergencyStop ? (
              <Badge variant="destructive">緊急停止 中</Badge>
            ) : system.wakeupEnabled ? (
              <Badge variant="outline">稼働中</Badge>
            ) : (
              <Badge variant="secondary">起床確認 無効</Badge>
            )}
          </div>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
