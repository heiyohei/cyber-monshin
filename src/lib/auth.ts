import { sign, verify } from "./session-token.ts";

export const ACCESS_COOKIE = "monshin_access";
const DEV_SECRET = "dev-only-secret";

// 本番で未設定なら null を返し、呼び出し側で止める。
export function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  return process.env.NODE_ENV === "production" ? null : DEV_SECRET;
}

function accessValue(code: string, secret: string): string {
  return sign("access", `${secret}:${code}`);
}

export function createAccessCookie(code: string, secret: string): string {
  return accessValue(code, secret);
}

export function isAccessCodeCorrect(input: string, code: string, secret: string): boolean {
  return verify(input, sign(code, secret), secret);
}

export function isAccessCookieValid(cookie: string | undefined, code: string, secret: string): boolean {
  return cookie !== undefined && verify("access", cookie, `${secret}:${code}`);
}
