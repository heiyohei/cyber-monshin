import type { FocusItem } from "../data/types.ts";
import type { ViewpointStates, ViewpointStatus } from "./verdict.ts";

export type Hole = { viewpointId: string; name: string; status: ViewpointStatus; text: string };

export type Result = {
  holes: Hole[];
  holeCount: number;
  nextSteps: { free: string[]; vendor: string[]; budget: string[] };
};

const TOP = 3;

// 穴は「できていない」か「わからない」の観点。まだ確かめていない観点は数えない。
// 順位と次の一手は固定データから選ぶ
export function computeResult(item: FocusItem, states: ViewpointStates): Result {
  const holes = item.viewpoints
    .filter((viewpoint) => states[viewpoint.id] === "denied" || states[viewpoint.id] === "unknown")
    .sort((a, b) => a.impactRank - b.impactRank);

  return {
    holes: holes.slice(0, TOP).map((viewpoint) => ({
      viewpointId: viewpoint.id,
      name: viewpoint.name,
      status: states[viewpoint.id],
      text: viewpoint.hole,
    })),
    holeCount: holes.length,
    nextSteps: {
      free: holes.map((viewpoint) => viewpoint.nextSteps.free),
      vendor: holes.map((viewpoint) => viewpoint.nextSteps.vendor),
      budget: holes.map((viewpoint) => viewpoint.nextSteps.budget),
    },
  };
}
