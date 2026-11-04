import assert from "node:assert/strict";
import { test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { finalMessageFast, type Speed } from "./claude.ts";

const MESSAGE = { id: "msg" } as Anthropic.Beta.BetaMessage;

function apiError(status: number) {
  return Anthropic.APIError.generate(status, { type: "error", error: { type: "x", message: "x" } }, "x", new Headers());
}

// 1回目の結果を決めて、呼ばれた速さと再試行の設定を控える。started なら、失敗の前に応答が1つ届いた形にする
function opener(first: () => Promise<Anthropic.Beta.BetaMessage>, started = false) {
  const calls: { speed: Speed; maxRetries?: number }[] = [];
  const open = (speed: Speed, options: { maxRetries?: number }) => {
    calls.push({ speed, maxRetries: options.maxRetries });
    const isFirst = calls.length === 1;
    let listener = () => {};
    return {
      on(_event: "streamEvent", next: () => void) {
        listener = next;
        return this;
      },
      finalMessage: async () => {
        if (!isFirst) return MESSAGE;
        if (started) listener();
        return first();
      },
    };
  };
  return { calls, open };
}

test("fast mode：まず fast で、SDK の自動の再試行をせずに送る", async () => {
  const { calls, open } = opener(async () => MESSAGE);
  assert.equal(await finalMessageFast("test", open), MESSAGE);
  assert.deepEqual(calls, [{ speed: "fast", maxRetries: 0 }]);
});

test("fast mode：混み合っているときや一時的な失敗では、ふつうの速さで1回だけ送り直す", async () => {
  for (const error of [
    apiError(429),
    apiError(529),
    apiError(500),
    apiError(408),
    new Anthropic.APIConnectionError({ message: "x" }),
    new Anthropic.APIConnectionTimeoutError(),
  ]) {
    const { calls, open } = opener(async () => {
      throw error;
    });
    assert.equal(await finalMessageFast("test", open), MESSAGE);
    assert.deepEqual(calls, [
      { speed: "fast", maxRetries: 0 },
      { speed: "standard", maxRetries: 0 },
    ]);
  }
});

test("fast mode：中断と、ほかの 400番台は送り直さない", async () => {
  for (const error of [apiError(400), apiError(403), new Anthropic.APIUserAbortError()]) {
    const { calls, open } = opener(async () => {
      throw error;
    });
    await assert.rejects(finalMessageFast("test", open), (thrown) => thrown === error);
    assert.equal(calls.length, 1);
  }
});

test("fast mode：応答が届き始めたあとの失敗は、途中の読み取りが二重にならないよう送り直さない", async () => {
  const error = apiError(529);
  const { calls, open } = opener(async () => {
    throw error;
  }, true);
  await assert.rejects(finalMessageFast("test", open), (thrown) => thrown === error);
  assert.equal(calls.length, 1);
});
