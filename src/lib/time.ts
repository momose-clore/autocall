import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

// 起床時刻・判定はすべて Asia/Tokyo で扱う（仕様書 39）。
// DB 保存は UTC のまま、表示・計算時に JST へ変換する。
export const APP_TZ = process.env.APP_TZ || "Asia/Tokyo";

/** UTC Date → JST 表示文字列（例: "2026-08-25 06:00"） */
export function formatJst(date: Date, pattern = "yyyy-MM-dd HH:mm"): string {
  return formatInTimeZone(date, APP_TZ, pattern);
}

/** JST の "HH:mm" のみ */
export function formatJstTime(date: Date): string {
  return formatInTimeZone(date, APP_TZ, "HH:mm");
}

/** UTC Date を JST 壁時計の Date（getHours 等が JST を返す）に変換 */
export function toJst(date: Date): Date {
  return toZonedTime(date, APP_TZ);
}

/**
 * 指定した「JST の日付 + HH:mm」を UTC の Date に変換する。
 * @param dateOnly 対象日（その日の JST 0:00 を表す任意の Date でよい）
 * @param hhmm "HH:mm"
 */
export function jstDateAtTime(dateOnly: Date, hhmm: string): Date {
  const ymd = formatInTimeZone(dateOnly, APP_TZ, "yyyy-MM-dd");
  const [h, m] = hhmm.split(":");
  // "2026-08-25 06:00:00" を JST として解釈し UTC へ
  return fromZonedTime(`${ymd} ${h.padStart(2, "0")}:${(m || "0").padStart(2, "0")}:00`, APP_TZ);
}

/** その Date が属する JST の日付の開始インスタント（JST 0:00 = 前日15:00 UTC） */
export function jstStartOfDay(date: Date): Date {
  const ymd = formatInTimeZone(date, APP_TZ, "yyyy-MM-dd");
  return fromZonedTime(`${ymd} 00:00:00`, APP_TZ);
}

/**
 * @db.Date 用: JST カレンダー日付を「UTC 深夜」で表す Date。
 * Prisma の @db.Date は Date を UTC 基準で日付に丸めるため、JST 深夜の
 * インスタント（前日15:00 UTC）を渡すと日付が1日前にズレる。これを防ぎ、
 * 外部システム（正しいカレンダー日を持つ）と一致させる。
 */
export function jstDateOnly(date: Date): Date {
  const ymd = formatInTimeZone(date, APP_TZ, "yyyy-MM-dd");
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** 分を加算した新しい Date */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** 2つの Date の差（分・切り捨て） */
export function diffMinutes(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 60_000);
}
