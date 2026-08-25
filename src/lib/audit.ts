import { prisma } from "@/lib/prisma";

// 管理者操作ログ（誰が・いつ・誰に・何を・変更前後）を記録する（仕様書 43）。
export async function writeAudit(params: {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorName: params.actorName ?? null,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        before: (params.before ?? undefined) as never,
        after: (params.after ?? undefined) as never,
      },
    });
  } catch (e) {
    // ログ失敗で本処理を止めない
    console.error("[audit] failed", e);
  }
}
