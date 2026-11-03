import type { FocusItem, ViewpointDef } from "../data/types.ts";
import type { ViewpointStates, ViewpointStatus } from "./verdict.ts";

export type Hole = { viewpointId: string; name: string; status: ViewpointStatus; text: string };

export type Result = {
  holes: Hole[];
  holeCount: number;
  nextSteps: { free: string[]; vendor: string[]; budget: string[] };
};

const TOP = 3;

// 穴の文は「できていない」ときの言い方で書いてある。「わからない」ときは言い切らず、
// 確かめたいことと、起きうることだけを示す（事務職員役の試用で「分からないと答えたのに言い切られた」と出たため）
export function holeText(viewpoint: Pick<ViewpointDef, "goal" | "hole">, status: ViewpointStatus): string {
  if (status !== "unknown") return viewpoint.hole;
  // 穴の文が1文だけなら、そのまま続ける（1文の中に、起きうることが書いてある）
  const sentences = viewpoint.hole.split("。").filter(Boolean);
  const consequence = sentences.length >= 2 ? `${sentences.slice(1).join("。")}。` : viewpoint.hole;
  return `「${viewpoint.goal}」かどうかが分かりません。${consequence}`;
}

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
      text: holeText(viewpoint, states[viewpoint.id]),
    })),
    holeCount: holes.length,
    nextSteps: {
      free: holes.map((viewpoint) => viewpoint.nextSteps.free),
      vendor: holes.map((viewpoint) => viewpoint.nextSteps.vendor),
      budget: holes.map((viewpoint) => viewpoint.nextSteps.budget),
    },
  };
}
