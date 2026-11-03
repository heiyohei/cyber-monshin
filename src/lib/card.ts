import type { CheckItem, Evidence, FocusItem } from "../data/types.ts";
import { computeResult, type Result } from "./result.ts";
import { computeVerdict, VERDICT_LABELS, type Verdict, type ViewpointStates, type ViewpointStatus } from "./verdict.ts";

export type Card = {
  itemId: string;
  itemName: string;
  verdict: Verdict;
  label: string;
  checkItems: readonly CheckItem[];
  itemEvidence: Evidence;
  viewpoints: { id: string; name: string; status: ViewpointStatus; evidence: Evidence }[];
  result: Result;
};

// 根拠は固定データだけから作る。判定もここで計算し直す。
export function buildCard(item: FocusItem, states: ViewpointStates, lastYearAnswer: string): Card {
  const verdict = computeVerdict(item, states);
  const lastYear = lastYearAnswer === "yes" ? "はい" : lastYearAnswer === "no" ? "いいえ" : "わからない";
  return {
    itemId: item.id,
    itemName: item.name,
    verdict,
    label: verdict === "reviewing" ? `去年の回答：${lastYear}` : VERDICT_LABELS[verdict],
    checkItems: item.checkItems,
    itemEvidence: item.defaultEvidence,
    viewpoints: item.viewpoints.map((viewpoint) => ({
      id: viewpoint.id,
      name: viewpoint.name,
      status: states[viewpoint.id],
      evidence: viewpoint.evidence,
    })),
    result: computeResult(item, states),
  };
}
