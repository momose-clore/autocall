import { redirect } from "next/navigation";
import { getSessionUser } from "./session";
import type { User } from "@/generated/prisma/client";

// 管理ページ/サーバーアクションの先頭で呼び、未ログインなら /login へ飛ばす。
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
