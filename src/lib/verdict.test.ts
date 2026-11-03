import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { UPDATE_ITEM } from "../data/update.ts";
import { computeVerdict, type Verdict, type ViewpointStates, type ViewpointStatus } from "./verdict.ts";

const STATUSES: ViewpointStatus[] = ["not_asked", "confirmed", "denied", "unknown"];

// SPEC 第6章の基準表をそのまま書いたもの
function expectedBackup(states: ViewpointStates): Verdict {
  if (states.acquire === "denied") return "no";
  if (states.acquire === "unknown") return "unknown";
  const others = [states.restore, states.isolate, states.procedure];
  if (others.includes("denied") || others.includes("unknown")) return "paper_only";
  return Object.values(states).includes("not_asked") ? "reviewing" : "confirmed_by_answer";
}

function allCombinations(ids: readonly string[]): ViewpointStates[] {
  return ids.reduce<ViewpointStates[]>(
    (acc, id) => acc.flatMap((states) => STATUSES.map((status) => ({ ...states, [id]: status }))),
    [{}],
  );
}

test("判定：バックアップの4観点の256通りすべてが基準どおりになる", () => {
  const combinations = allCombinations(BACKUP_ITEM.viewpoints.map((viewpoint) => viewpoint.id));
  assert.equal(combinations.length, 256);
  for (const states of combinations) {
    assert.equal(computeVerdict(BACKUP_ITEM, states), expectedBackup(states), JSON.stringify(states));
  }
});

test("判定：更新プログラムも同じ基準で、適用が最も重い観点になる", () => {
  for (const states of allCombinations(UPDATE_ITEM.viewpoints.map((viewpoint) => viewpoint.id))) {
    const verdict = computeVerdict(UPDATE_ITEM, states);
    if (states.apply === "denied") assert.equal(verdict, "no");
    else if (states.apply === "unknown") assert.equal(verdict, "unknown");
    else if (Object.values(states).some((status) => status === "denied" || status === "unknown")) {
      assert.equal(verdict, "paper_only");
    } else if (Object.values(states).includes("not_asked")) assert.equal(verdict, "reviewing");
    else assert.equal(verdict, "confirmed_by_answer");
  }
});

test("判定：設計の例どおりに変わる", () => {
  const states: ViewpointStates = {
    acquire: "confirmed",
    restore: "not_asked",
    isolate: "not_asked",
    procedure: "not_asked",
  };
  assert.equal(computeVerdict(BACKUP_ITEM, states), "reviewing");
  assert.equal(computeVerdict(BACKUP_ITEM, { ...states, restore: "unknown" }), "paper_only");
});
