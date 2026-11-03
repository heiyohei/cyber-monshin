import { BACKUP_ITEM, BACKUP_RESULTS } from "../data/backup.ts";
import { VIEWPOINT_IDS, type ViewpointId, type ViewpointStates, type ViewpointStatus } from "./verdict.ts";

export type Hole = { viewpointId: ViewpointId; name: string; status: ViewpointStatus; text: string };

export type Result = {
  holes: Hole[];
  holeCount: number;
  nextSteps: { free: string[]; vendor: string[]; budget: string[] };
};

const TOP = 3;

// 穴は「できていない」か「わからない」の観点。まだ確かめていない観点は数えない。
// 順位と次の一手は固定データから選ぶ
export function computeResult(states: ViewpointStates): Result {
  const holes = VIEWPOINT_IDS.filter((id) => states[id] === "denied" || states[id] === "unknown")
    .sort((a, b) => BACKUP_RESULTS[a].impactRank - BACKUP_RESULTS[b].impactRank)
    .map((id) => ({
      viewpointId: id,
      name: BACKUP_ITEM.viewpoints.find((viewpoint) => viewpoint.id === id)!.name,
      status: states[id],
      text: BACKUP_RESULTS[id].hole,
    }));

  return {
    holes: holes.slice(0, TOP),
    holeCount: holes.length,
    nextSteps: {
      free: holes.map((hole) => BACKUP_RESULTS[hole.viewpointId].nextSteps.free),
      vendor: holes.map((hole) => BACKUP_RESULTS[hole.viewpointId].nextSteps.vendor),
      budget: holes.map((hole) => BACKUP_RESULTS[hole.viewpointId].nextSteps.budget),
    },
  };
}
