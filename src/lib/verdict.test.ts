import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeBackupVerdict,
  VIEWPOINT_IDS,
  type Verdict,
  type ViewpointStates,
  type ViewpointStatus,
} from "./verdict.ts";

const STATUSES: ViewpointStatus[] = ["not_asked", "confirmed", "denied", "unknown"];

function expected(states: ViewpointStates): Verdict {
  if (states.acquire === "denied") return "no";
  if (states.acquire === "unknown") return "unknown";
  const others = [states.restore, states.isolate, states.procedure];
  if (others.includes("denied") || others.includes("unknown")) return "paper_only";
  return Object.values(states).includes("not_asked") ? "reviewing" : "confirmed_by_answer";
}

test("判定：4観点の256通りすべてが基準どおりになる", () => {
  let count = 0;
  for (const acquire of STATUSES) {
    for (const restore of STATUSES) {
      for (const isolate of STATUSES) {
        for (const procedure of STATUSES) {
          const states = { acquire, restore, isolate, procedure };
          assert.equal(computeBackupVerdict(states), expected(states), JSON.stringify(states));
          count += 1;
        }
      }
    }
  }
  assert.equal(count, STATUSES.length ** VIEWPOINT_IDS.length);
});

test("判定：設計の例どおりに変わる", () => {
  const states: ViewpointStates = {
    acquire: "confirmed",
    restore: "not_asked",
    isolate: "not_asked",
    procedure: "not_asked",
  };
  assert.equal(computeBackupVerdict(states), "reviewing");
  assert.equal(computeBackupVerdict({ ...states, restore: "unknown" }), "paper_only");
});
