import { BACKUP_ITEM, type Evidence } from "../data/backup.ts";
import { computeResult, type Result } from "./result.ts";
import { computeBackupVerdict, VERDICT_LABELS, type Verdict, type ViewpointId, type ViewpointStates, type ViewpointStatus } from "./verdict.ts";

export type Card = {
  verdict: Verdict;
  label: string;
  checkItemText: string;
  itemEvidence: Evidence;
  viewpoints: { id: ViewpointId; name: string; status: ViewpointStatus; evidence: Evidence }[];
  result: Result;
};

// 根拠は固定データだけから作る。判定もここで計算し直す。
export function buildCard(states: ViewpointStates, lastYearAnswer: string): Card {
  const verdict = computeBackupVerdict(states);
  const lastYear = lastYearAnswer === "yes" ? "はい" : lastYearAnswer === "no" ? "いいえ" : "不明";
  return {
    verdict,
    label: verdict === "reviewing" ? `去年の回答：${lastYear}` : VERDICT_LABELS[verdict],
    checkItemText: BACKUP_ITEM.checkItemText,
    itemEvidence: BACKUP_ITEM.defaultEvidence,
    viewpoints: BACKUP_ITEM.viewpoints.map((viewpoint) => ({
      id: viewpoint.id,
      name: viewpoint.name,
      status: states[viewpoint.id],
      evidence: viewpoint.evidence,
    })),
    result: computeResult(states),
  };
}
