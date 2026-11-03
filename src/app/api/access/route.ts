import { cookies } from "next/headers";
import { z } from "zod";
import { ACCESS_COOKIE, createAccessCookie, getSessionSecret, isAccessCodeCorrect } from "@/lib/auth";

const BodySchema = z.object({ code: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const code = process.env.ACCESS_CODE;
  const secret = getSessionSecret();
  if (!code || !secret) {
    return Response.json({ error: "現在はご利用いただけません。このアプリの設定に問題があるため、管理者に連絡してください。" }, { status: 503 });
  }

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !isAccessCodeCorrect(body.data.code, code, secret)) {
    return Response.json({ error: "合言葉が違います。もう一度入力してください。" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, createAccessCookie(code, secret), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    maxAge: 60 * 60 * 24 * 7,
  });
  return Response.json({ ok: true });
}
