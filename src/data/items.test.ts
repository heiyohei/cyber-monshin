import assert from "node:assert/strict";
import { test } from "node:test";
import { stepIdsOf } from "../lib/result.ts";
import { computeVerdict } from "../lib/verdict.ts";
import { ITEMS } from "./items.ts";

test("重点項目：5つすべてを選べる", () => {
  assert.deepEqual(
    ITEMS.map((item) => item.id),
    ["devices", "update", "accounts", "backup", "continuity"],
  );
});

test("重点項目：次の一手の ID は、5つの項目をまたいでも重複しない", () => {
  const ids = ITEMS.flatMap((item) => stepIdsOf(item));
  assert.equal(ids.length, 60);
  assert.equal(new Set(ids).size, ids.length, "次の一手の ID が項目をまたいで重複している");
});

for (const item of ITEMS) {
  test(`重点項目（${item.name}）：固定データに抜けや重複がない`, () => {
    const ids = item.viewpoints.map((viewpoint) => viewpoint.id);
    assert.equal(new Set(ids).size, ids.length, "観点の ID が重複している");
    assert.ok(item.primaryViewpoints.every((id) => ids.includes(id)), "最も重い観点が観点にない");

    const ranks = item.viewpoints.map((viewpoint) => viewpoint.impactRank).sort((a, b) => a - b);
    assert.deepEqual(ranks, ids.map((_, index) => index + 1), "穴の順位が1から順になっていない");

    const evidenceIds = [item.defaultEvidence.id, ...item.viewpoints.map((viewpoint) => viewpoint.evidence.id)];
    assert.equal(new Set(evidenceIds).size, evidenceIds.length, "根拠の ID が重複している");

    const options = item.firstQuestion.options;
    assert.ok(options.length >= 2 && options.length <= 4, "選択肢は2〜4個");
    assert.equal(options.at(-1), "わからない");

    for (const viewpoint of item.viewpoints) {
      assert.ok(
        viewpoint.nextSteps.free.text && viewpoint.nextSteps.vendor.text && viewpoint.nextSteps.budget.text,
        viewpoint.id,
      );
    }
    for (const checkItem of item.checkItems) assert.ok(checkItem.keywords.length > 0, checkItem.no);
  });

  // 次の一手の ID は保存ファイルの「やった」印に使う。項目の中で重複せず、項目の ID で始まる（ほかの項目と混ざらない）
  test(`重点項目（${item.name}）：次の一手の ID が重複せず、項目の ID で始まる`, () => {
    const ids = stepIdsOf(item);
    assert.equal(ids.length, item.viewpoints.length * 3);
    assert.equal(new Set(ids).size, ids.length, "次の一手の ID が重複している");
    for (const id of ids) assert.ok(id.startsWith(`${item.id}.`), id);
  });

  test(`重点項目（${item.name}）：最も重い観点が否定なら「いいえ」、すべて確認済みなら「回答で確認」`, () => {
    const confirmed = Object.fromEntries(item.viewpoints.map((viewpoint) => [viewpoint.id, "confirmed" as const]));
    assert.equal(computeVerdict(item, confirmed), "confirmed_by_answer");
    assert.equal(computeVerdict(item, { ...confirmed, [item.primaryViewpoints[0]]: "denied" }), "no");
    assert.equal(computeVerdict(item, { ...confirmed, [item.primaryViewpoints[0]]: "unknown" }), "unknown");
  });
}
