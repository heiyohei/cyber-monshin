import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { ITEMS } from "../data/items.ts";
import { computeResult, holeText } from "./result.ts";
import { initialStates, type ViewpointStates } from "./verdict.ts";

test("結果：まだ確かめていない観点と確認済みの観点は穴に数えない", () => {
  const states: ViewpointStates = { ...initialStates(BACKUP_ITEM), acquire: "confirmed" };
  const result = computeResult(BACKUP_ITEM, states);
  assert.equal(result.holeCount, 0);
  assert.deepEqual(result.nextSteps, { free: [], vendor: [], budget: [] });
});

test("結果：穴は影響の順位で並び、上位3件だけを示す", () => {
  const states: ViewpointStates = {
    acquire: "unknown",
    restore: "denied",
    isolate: "denied",
    procedure: "unknown",
  };
  const result = computeResult(BACKUP_ITEM, states);
  assert.deepEqual(
    result.holes.map((hole) => hole.viewpointId),
    ["acquire", "isolate", "restore"],
  );
  assert.equal(result.holeCount, 4);
  assert.equal(result.nextSteps.free.length, 4);
});

test("結果：穴が3件未満なら見つかった件数だけ示し、次の一手は3分類そろう", () => {
  const states: ViewpointStates = {
    acquire: "confirmed",
    restore: "unknown",
    isolate: "confirmed",
    procedure: "confirmed",
  };
  const result = computeResult(BACKUP_ITEM, states);
  assert.equal(result.holes.length, 1);
  assert.equal(result.holes[0].name, "戻す確認");
  assert.equal(result.nextSteps.free.length, 1);
  assert.equal(result.nextSteps.vendor.length, 1);
  assert.equal(result.nextSteps.budget.length, 1);
});

test("結果：同じ状態なら必ず同じ結果になる", () => {
  const states: ViewpointStates = { acquire: "confirmed", restore: "denied", isolate: "unknown", procedure: "denied" };
  assert.deepEqual(computeResult(BACKUP_ITEM, states), computeResult(BACKUP_ITEM, { ...states }));
});

test("結果：「わからない」の穴は言い切らず、確かめたいことと起きうることだけを示す", () => {
  const isolate = BACKUP_ITEM.viewpoints.find((viewpoint) => viewpoint.id === "isolate")!;
  assert.equal(holeText(isolate, "denied"), isolate.hole);
  const text = holeText(isolate, "unknown");
  assert.ok(text.startsWith(`「${isolate.goal}」かどうかが分かりません。`), text);
  assert.ok(text.includes("おそれがあります"), text);
  assert.ok(!text.includes("つながったままです"), text);

  const states: ViewpointStates = { acquire: "confirmed", restore: "confirmed", isolate: "unknown", procedure: "confirmed" };
  assert.equal(computeResult(BACKUP_ITEM, states).holes[0].text, text);
});

test("結果：どの観点でも、「わからない」の穴の文は言い切らない", () => {
  for (const item of ITEMS) {
    for (const viewpoint of item.viewpoints) {
      assert.equal(holeText(viewpoint, "denied"), viewpoint.hole);
      const text = holeText(viewpoint, "unknown");
      assert.ok(text.startsWith(`「${viewpoint.goal}」かどうかが分かりません。`), `${item.id}/${viewpoint.id}: ${text}`);
      assert.ok(!text.includes("ません。。"), text);
    }
  }
});
