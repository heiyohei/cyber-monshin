import { BACKUP_ITEM } from "@/data/backup";
import { computeBackupVerdict, VERDICT_LABELS, type Verdict, type ViewpointId, type ViewpointStates, type ViewpointStatus } from "./verdict.ts";

export type Card = {
  verdict: Verdict;
  label: string;
  viewpoints: { id: ViewpointId; name: string; status: ViewpointStatus; evidence: string }[];
};

// 根拠は固定データだけから作る。判定もここで計算し直す。
export function buildCard(states: ViewpointStates, lastYearAnswer: string): Card {
  const verdict = computeBackupVerdict(states);
  const lastYear = lastYearAnswer === "yes" ? "はい" : lastYearAnswer === "no" ? "いいえ" : "不明";
  return {
    verdict,
    label: verdict === "reviewing" ? `去年の回答：${lastYear}` : VERDICT_LABELS[verdict],
    viewpoints: BACKUP_ITEM.viewpoints.map((viewpoint) => ({
      id: viewpoint.id,
      name: viewpoint.name,
      status: states[viewpoint.id],
      evidence: viewpoint.evidence,
    })),
  };
}
