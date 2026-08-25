import type { SystemSetting, WakeupSetting } from "@/generated/prisma/client";

// ドライバー個別設定（wakeup_settings）とシステム全体設定を統合した実効設定。
// 個別設定を優先しつつ、全体トグルと安全上限はシステム側で必ず効かせる。
export interface EffectiveSettings {
  callIntervalMinutes: number;
  lineIntervalMinutes: number;
  escalationMinutes: number;
  maxDurationMinutes: number;
  phoneEnabled: boolean;
  lineEnabled: boolean;
  /** 実効の最低発信間隔（秒）。callInterval と minCallIntervalSeconds の大きい方。 */
  effectiveCallIntervalSeconds: number;
}

export function resolveEffectiveSettings(
  system: SystemSetting,
  setting: WakeupSetting | null,
): EffectiveSettings {
  const callMin = setting?.callIntervalMinutes ?? system.defaultCallInterval;
  const lineMin = setting?.lineIntervalMinutes ?? system.defaultLineInterval;
  const escalation = setting?.escalationMinutes ?? system.escalationMinutes;
  const maxDuration = setting?.maxDurationMinutes ?? system.maxDurationMinutes;
  // 全体トグルが OFF なら個別 ON でも無効
  const phoneEnabled = system.phoneEnabled && (setting?.phoneEnabled ?? true);
  const lineEnabled = system.lineEnabled && (setting?.lineEnabled ?? true);
  const effectiveCallIntervalSeconds = Math.max(
    callMin * 60,
    system.minCallIntervalSeconds, // システム下限（仕様書 46）
  );
  return {
    callIntervalMinutes: callMin,
    lineIntervalMinutes: lineMin,
    escalationMinutes: escalation,
    maxDurationMinutes: maxDuration,
    phoneEnabled,
    lineEnabled,
    effectiveCallIntervalSeconds,
  };
}
