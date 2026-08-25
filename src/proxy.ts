import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie 名は session.ts と一致させること（edge runtime のため直値で保持）。
const SESSION_COOKIE_NAME = "autocall_session";

// /admin 配下は Cookie 未所持なら /login へリダイレクト（UX 用の一次ガード）。
// 署名検証・失効チェックは各ページ/アクションの requireUser() で厳密に行う。
// Next 16 の proxy 規約（旧 middleware）に準拠。
export function proxy(req: NextRequest) {
  const hasCookie = req.cookies.has(SESSION_COOKIE_NAME);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
