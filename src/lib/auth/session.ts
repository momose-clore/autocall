import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/config";
import type { User } from "@/generated/prisma/client";

// 単体構築版の簡易セッション（仕様書 54）。
// Cookie にサインした userId を格納し、HMAC で改ざん検知する。
// 外部認証基盤を入れるまでの暫定。将来 NextAuth 等へ差し替え可能。

const COOKIE_NAME = "autocall_session";
const MAX_AGE_SEC = 60 * 60 * 12; // 12時間

function sign(value: string): string {
  return createHmac("sha256", env.adminSessionSecret).update(value).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/** userId から Cookie 値（"<userId>.<sig>"）を生成 */
function encode(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** Cookie 値から userId を復元（改ざん時は null） */
function decode(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const userId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  return safeEqualHex(sig, sign(userId)) ? userId : null;
}

/** ログイン成功後にセッション Cookie を設定する */
export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encode(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

/** セッションを破棄する（ログアウト） */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** 現在のログインユーザーを取得（未ログイン/無効なら null） */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const userId = decode(store.get(COOKIE_NAME)?.value);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;
  return user;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
