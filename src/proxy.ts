import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, getSessionSecret, isAccessCookieValid } from "@/lib/auth";

function deny(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

// API の入口の確認。合言葉がなければ Claude の呼び出しまで届かない。
export function proxy(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return deny(403, "このページの画面からご利用ください。");
  }
  if (request.nextUrl.pathname === "/api/access") return NextResponse.next();

  const code = process.env.ACCESS_CODE;
  const secret = getSessionSecret();
  if (process.env.NODE_ENV === "production" && (!code || !secret)) {
    return deny(503, "現在はご利用いただけません。このアプリの設定に問題があるため、管理者に連絡してください。");
  }
  if (!code || !secret) return NextResponse.next();

  const cookie = request.cookies.get(ACCESS_COOKIE)?.value;
  if (!isAccessCookieValid(cookie, code, secret)) {
    return deny(401, "合言葉の確認が、まだ終わっていません。すぐ下の欄に合言葉を入れて「確かめる」を押してください。");
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
