// 電話番号を発信用 E.164（日本）へ正規化する（仕様書 33）。
// 例: "090-1234-5678" / "09012345678" → "+819012345678"

/** E.164(日本) へ正規化。不正な場合は null を返し、発信しない判断に使う。 */
export function toE164JP(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // 全角数字→半角、ハイフン・空白・括弧を除去
  const zen2han = raw.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );
  let s = zen2han.replace(/[\s\-()]/g, "").trim();

  if (s.startsWith("+")) {
    // 既に国際形式
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }
  // "0081..." → "+81..."
  if (s.startsWith("0081")) s = "+" + s.slice(2);
  if (s.startsWith("81") && !s.startsWith("810")) {
    // 先頭 81 で国番号らしき場合（保守的に扱う）
    // ただし国内番号 "81..." と誤認しないよう、11桁の国内番号は下で処理
  }
  // 国内番号: 先頭 0 + 9〜10桁
  if (/^0\d{9,10}$/.test(s)) {
    return "+81" + s.slice(1);
  }
  return null;
}

/** 表示用に E.164(日本) を国内表記へ（+819012345678 → 09012345678） */
export function toDomesticJP(e164: string | null | undefined): string | null {
  if (!e164) return null;
  if (e164.startsWith("+81")) return "0" + e164.slice(3);
  return e164;
}

export function isValidE164(s: string | null | undefined): boolean {
  return !!s && /^\+\d{8,15}$/.test(s);
}
