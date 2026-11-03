// 判定はここだけで計算する。Claude の出力をそのまま判定にしない。
export const VIEWPOINT_IDS = ["acquire", "restore", "isolate", "procedure"] as const;
export type ViewpointId = (typeof VIEWPOINT_IDS)[number];

export type ViewpointStatus = "not_asked" | "confirmed" | "denied" | "unknown";
export type ViewpointStates = Record<ViewpointId, ViewpointStatus>;

export type Verdict = "no" | "unknown" | "paper_only" | "confirmed_by_answer" | "reviewing";

export const VERDICT_LABELS: Record<Verdict, string> = {
  no: "いいえ",
  unknown: "要確認",
  paper_only: "はい（書類上だけ）",
  confirmed_by_answer: "はい（回答で確認）",
  reviewing: "確認中",
};

export function initialStates(): ViewpointStates {
  return { acquire: "not_asked", restore: "not_asked", isolate: "not_asked", procedure: "not_asked" };
}

export function computeBackupVerdict(states: ViewpointStates): Verdict {
  if (states.acquire === "denied") return "no";
  if (states.acquire === "unknown") return "unknown";

  const others = [states.restore, states.isolate, states.procedure];
  if (others.some((status) => status === "denied" || status === "unknown")) return "paper_only";
  if (VIEWPOINT_IDS.every((id) => states[id] === "confirmed")) return "confirmed_by_answer";
  return "reviewing";
}
