import { redirect } from "next/navigation";

// ルートは管理ダッシュボードへ。未ログインなら middleware が /login へ回す。
export default function Home() {
  redirect("/admin");
}
