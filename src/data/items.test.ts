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

  // 画面に出す観点の表示名（label）。Claude に渡す観点名（name）とは別に持つ。
  // 短く（15文字まで）、項目の中で重ならない（画面の言葉から観点を探すとき、別の観点に当たらないように）
  test(`重点項目（${item.name}）：観点の表示名が空でなく、短く、項目の中で重ならない`, () => {
    const labels = item.viewpoints.map((viewpoint) => viewpoint.label);
    for (const viewpoint of item.viewpoints) {
      assert.ok(viewpoint.label.trim() === viewpoint.label && viewpoint.label.length > 0, viewpoint.id);
      assert.ok(viewpoint.label.length <= 15, `${viewpoint.label}（${viewpoint.label.length}文字）`);
      assert.notEqual(viewpoint.label, viewpoint.name, viewpoint.id);
      const others = labels.filter((label) => label !== viewpoint.label);
      assert.ok(!others.some((label) => label.includes(viewpoint.label) || viewpoint.label.includes(label)), viewpoint.label);
    }
    assert.equal(new Set(labels).size, labels.length);
  });

  // 次の一手の ID は保存ファイルの「やった」印に使う。項目の中で重複せず、項目の ID で始まる（ほかの項目と混ざらない）
  test(`重点項目（${item.name}）：次の一手の ID が重複せず、項目の ID で始まる`, () => {
    const ids = stepIdsOf(item);
    assert.equal(ids.length, item.viewpoints.length * 3);
    assert.equal(new Set(ids).size, ids.length, "次の一手の ID が重複している");
    for (const id of ids) assert.ok(id.startsWith(`${item.id}.`), id);
  });

  test(`重点項目（${item.name}）：最も重い観点が否定なら「いいえ」、すべて確認済みなら「はい（回答で確認）」`, () => {
    const confirmed = Object.fromEntries(item.viewpoints.map((viewpoint) => [viewpoint.id, "confirmed" as const]));
    assert.equal(computeVerdict(item, confirmed), "confirmed_by_answer");
    assert.equal(computeVerdict(item, { ...confirmed, [item.primaryViewpoints[0]]: "denied" }), "no");
    assert.equal(computeVerdict(item, { ...confirmed, [item.primaryViewpoints[0]]: "unknown" }), "unknown");
  });
}
