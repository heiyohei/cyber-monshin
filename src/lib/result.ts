import type { FocusItem, NextStep, ViewpointDef } from "../data/types.ts";
import type { ViewpointStates, ViewpointStatus } from "./verdict.ts";

// label は画面に出す観点の表示名（固定データの label）
export type Hole = { viewpointId: string; label: string; status: ViewpointStatus; text: string };

// 次の一手の分類。画面と説明用の1枚では、この順に出す
export const STEP_GROUP_KEYS = ["free", "vendor", "budget"] as const;
export type StepGroupKey = (typeof STEP_GROUP_KEYS)[number];
export type NextStepGroups = Record<StepGroupKey, NextStep[]>;

export type Result = {
  holes: Hole[];
  holeCount: number;
  nextSteps: NextStepGroups;
};

const TOP = 3;

// 項目の次の一手の ID。保存ファイルの「やった」印が、この項目のものかを照らすのに使う
export function stepIdsOf(item: FocusItem): string[] {
  return item.viewpoints.flatMap((viewpoint) => STEP_GROUP_KEYS.map((key) => viewpoint.nextSteps[key].id));
}

// 「やった」印のない次の一手。画面の「残っていること n件」と、説明用の1枚の「引き継ぐこと」で使う
export function remainingSteps(steps: NextStepGroups, done: readonly string[]): NextStepGroups {
  const marked = new Set(done);
  return {
    free: steps.free.filter((step) => !marked.has(step.id)),
    vendor: steps.vendor.filter((step) => !marked.has(step.id)),
    budget: steps.budget.filter((step) => !marked.has(step.id)),
  };
}

export function countSteps(steps: NextStepGroups): number {
  return steps.free.length + steps.vendor.length + steps.budget.length;
}

// 「残っていること n件（全部で m件）」のすぐ下に出す、何を数えたかの1行。次にすることは、止まるおそれがある観点1つにつき、
// 3つの分類（院内、ベンダー、予算）に1つずつ出す（computeResult）。「下の3つ」は、すぐ下に並ぶ分類ごとの一覧のこと
export function stepsCountNote(holeCount: number, total: number): string {
  return `止まるおそれのある${holeCount}か所それぞれに、下の3つの分類へ1件ずつ出しています（${holeCount}か所×3分類＝${total}件）。「やった」の印を付けると、残っていることの件数が減ります。`;
}

// 「まず、これから」の1件。次にすることの件数が多く、どれから始めるか分からないと、事務職員役の4人が報告したため。
// 影響の大きい順（穴の並び）に、院内 → ベンダー → 予算の順で見て、「やった」印のない最初の1件を選ぶ。
// holeLabel は、その一手がどの穴のためかの表示名（上位3つの穴のときだけ分かる）
export type FirstStep = { step: NextStep; group: StepGroupKey; holeLabel: string | null };

export function firstStep(result: Result, done: readonly string[]): FirstStep | null {
  const marked = new Set(done);
  for (let index = 0; index < result.holeCount; index += 1) {
    for (const group of STEP_GROUP_KEYS) {
      const step = result.nextSteps[group][index];
      if (step && !marked.has(step.id)) return { step, group, holeLabel: result.holes[index]?.label ?? null };
    }
  }
  return null;
}

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
      label: viewpoint.label,
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
