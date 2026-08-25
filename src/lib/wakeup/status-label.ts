import { WakeupStatus } from "@/generated/prisma/client";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

// 起床セッションの状態を日本語ラベルとバッジ配色にマッピングする（仕様書 12）。
export const STATUS_LABEL: Record<WakeupStatus, string> = {
  WAITING: "待機中",
  CALLING: "確認中",
  CONFIRMED: "起床済",
  OVERDUE: "起床遅延",
  FAILED: "確認失敗",
  CANCELLED: "対象外",
};

export const STATUS_VARIANT: Record<WakeupStatus, BadgeVariant> = {
  WAITING: "secondary",
  CALLING: "default",
  CONFIRMED: "outline",
  OVERDUE: "destructive",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export function statusLabel(status: WakeupStatus): string {
  return STATUS_LABEL[status] ?? status;
}

export function statusVariant(status: WakeupStatus): BadgeVariant {
  return STATUS_VARIANT[status] ?? "secondary";
}
