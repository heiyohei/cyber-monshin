import assert from "node:assert/strict";
import { test } from "node:test";
import { computeVerdict } from "../lib/verdict.ts";
import { ITEMS } from "./items.ts";

test("重点項目：5つすべてを選べる", () => {
  assert.deepEqual(
    ITEMS.map((item) => item.id),
    ["devices", "update", "accounts", "backup", "continuity"],
  );
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
      assert.ok(viewpoint.nextSteps.free && viewpoint.nextSteps.vendor && viewpoint.nextSteps.budget, viewpoint.id);
    }
    for (const checkItem of item.checkItems) assert.ok(checkItem.keywords.length > 0, checkItem.no);
  });

  test(`重点項目（${item.name}）：最も重い観点が否定なら「いいえ」、すべて確認済みなら「回答で確認」`, () => {
    const confirmed = Object.fromEntries(item.viewpoints.map((viewpoint) => [viewpoint.id, "confirmed" as const]));
    assert.equal(computeVerdict(item, confirmed), "confirmed_by_answer");
    assert.equal(computeVerdict(item, { ...confirmed, [item.primaryViewpoints[0]]: "denied" }), "no");
    assert.equal(computeVerdict(item, { ...confirmed, [item.primaryViewpoints[0]]: "unknown" }), "unknown");
  });
}
