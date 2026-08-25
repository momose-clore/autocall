import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// 追加依存を増やさず node:crypto の scrypt でパスワードをハッシュ化する。
// 形式: "scrypt$<saltHex>$<hashHex>"。管理画面ログインと seed で共用する。
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
