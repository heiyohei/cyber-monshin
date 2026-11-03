import { createHmac, timingSafeEqual } from "node:crypto";

// サーバーは状態を持たないので、ブラウザに預ける履歴に改ざん検知の印を付ける。
export function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verify(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
