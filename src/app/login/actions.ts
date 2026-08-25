"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";

export interface LoginState {
  error?: string;
}

// 簡易ログイン（仕様書 54）。メール＋パスワードを検証してセッションを張る。
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
    // ユーザー有無を区別しない（列挙攻撃対策）
    return { error: "メールアドレスまたはパスワードが違います。" };
  }

  await createSession(user.id);
  await writeAudit({
    actorId: user.id,
    actorName: user.name,
    action: "auth.login",
    targetType: "User",
    targetId: user.id,
  });

  redirect(next.startsWith("/admin") ? next : "/admin");
}
