import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { ITEMS } from "../data/items.ts";
import { computeResult, countSteps, firstStep, holeText, remainingSteps, stepIdsOf, stepsCountNote } from "./result.ts";
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
  // 次の一手も穴の順（影響の順位）で並び、固定データの ID と文をそのまま持つ
  assert.deepEqual(
    result.nextSteps.free.map((step) => step.id),
    ["backup.acquire.free", "backup.isolate.free", "backup.restore.free", "backup.procedure.free"],
  );
  assert.equal(result.nextSteps.vendor[1].text, "バックアップを、攻撃が届かない場所に分けて保管しているかを聞きます。");
});

test("結果：「やった」印のある次の一手を除くと、残りの件数が減る", () => {
  const states: ViewpointStates = { acquire: "confirmed", restore: "unknown", isolate: "denied", procedure: "confirmed" };
  const result = computeResult(BACKUP_ITEM, states);
  assert.equal(countSteps(result.nextSteps), 6);
  const remaining = remainingSteps(result.nextSteps, ["backup.isolate.free", "backup.restore.vendor"]);
  assert.equal(countSteps(remaining), 4);
  assert.deepEqual(
    remaining.free.map((step) => step.id),
    ["backup.restore.free"],
  );
  assert.deepEqual(
    remaining.vendor.map((step) => step.id),
    ["backup.isolate.vendor"],
  );
  assert.equal(remaining.budget.length, 2);
  // 知らない ID や、穴でない観点の ID は、何も変えない
  assert.equal(countSteps(remainingSteps(result.nextSteps, ["other.id", "backup.acquire.free"])), 6);
  // 元の結果は変わらない
  assert.equal(countSteps(result.nextSteps), 6);
});

test("結果：項目の次の一手の ID は観点ごとに3つ", () => {
  assert.equal(stepIdsOf(BACKUP_ITEM).length, 12);
  assert.ok(stepIdsOf(BACKUP_ITEM).includes("backup.procedure.budget"));
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
  assert.equal(result.holes[0].viewpointId, "restore");
  // 画面に出す名前は、固定データの表示名（label）
  assert.equal(result.holes[0].label, BACKUP_ITEM.viewpoints.find((viewpoint) => viewpoint.id === "restore")?.label);
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

test("結果：次にすることの件数は、止まるおそれの件数の3倍で、数え方の1行の式と合う", () => {
  for (const item of ITEMS) {
    // 観点を1つずつ「できていない」にしていき、穴が1件から全部までのときを確かめる（穴が4件で、上位3件だけを示すときも含む）
    const states: ViewpointStates = initialStates(item);
    for (const viewpoint of item.viewpoints) {
      states[viewpoint.id] = "denied";
      const result = computeResult(item, states);
      const total = countSteps(result.nextSteps);
      assert.equal(total, result.holeCount * 3, item.id);
      for (const key of ["free", "vendor", "budget"] as const) assert.equal(result.nextSteps[key].length, result.holeCount);
      assert.ok(stepsCountNote(result.holeCount, total).includes(`${result.holeCount}か所それぞれに`));
      assert.ok(stepsCountNote(result.holeCount, total).includes("「まず、これから」"));
      assert.ok(!stepsCountNote(result.holeCount, total, false).includes("「まず、これから」"));
      assert.ok(stepsCountNote(result.holeCount, total).includes(`合わせて${total}件`));
    }
  }
});

test("結果：「まず、これから」は、影響のいちばん大きい穴の院内でできることから選び、印を付けると次へ進む", () => {
  const states: ViewpointStates = { acquire: "confirmed", restore: "unknown", isolate: "denied", procedure: "confirmed" };
  const result = computeResult(BACKUP_ITEM, states);
  const first = firstStep(result, []);
  assert.equal(first?.step.id, "backup.isolate.free");
  assert.equal(first?.group, "free");
  assert.equal(first?.holeLabel, result.holes[0].label);

  // 院内 → ベンダー → 予算の順に進み、その穴が済んだら次の穴へ
  assert.equal(firstStep(result, ["backup.isolate.free"])?.step.id, "backup.isolate.vendor");
  const sameHole = ["backup.isolate.free", "backup.isolate.vendor", "backup.isolate.budget"];
  assert.equal(firstStep(result, sameHole)?.step.id, "backup.restore.free");
  assert.equal(firstStep(result, sameHole)?.holeLabel, result.holes[1].label);

  // すべて済んだとき、穴がないときは出さない
  assert.equal(firstStep(result, stepIdsOf(BACKUP_ITEM)), null);
  assert.equal(firstStep(computeResult(BACKUP_ITEM, initialStates(BACKUP_ITEM)), []), null);
});
