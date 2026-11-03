import assert from "node:assert/strict";
import { test } from "node:test";
import { sign, verify } from "./session-token.ts";

const SECRET = "test-secret";

test("署名：正しい組み合わせだけ通す", () => {
  const payload = JSON.stringify({ messages: [] });
  assert.equal(verify(payload, sign(payload, SECRET), SECRET), true);
});

test("署名：履歴の改ざん、別の秘密、形の違う署名を拒否する", () => {
  const payload = JSON.stringify({ messages: [] });
  const signature = sign(payload, SECRET);
  assert.equal(verify(payload + " ", signature, SECRET), false);
  assert.equal(verify(payload, signature, "other-secret"), false);
  assert.equal(verify(payload, "short", SECRET), false);
});
