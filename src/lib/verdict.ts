// 判定はここだけで計算する。Claude の出力をそのまま判定にしない。
export type ViewpointStatus = "not_asked" | "confirmed" | "denied" | "unknown";
export type ViewpointStates = Record<string, ViewpointStatus>;
// 観点の状態を何で確かめたか。判定には使わず、表示だけに使う
export type ViewpointSource = "answer" | "reply";
export type ViewpointSources = Partial<Record<string, ViewpointSource>>;

export type Verdict = "no" | "unknown" | "paper_only" | "confirmed_by_answer" | "reviewing";

export const VERDICT_LABELS: Record<Verdict, string> = {
  no: "いいえ",
  unknown: "要確認",
  paper_only: "はい（書類上だけ）",
  confirmed_by_answer: "はい（回答で確認）",
  reviewing: "確認中",
};

type VerdictRule = { primaryViewpoints: readonly string[]; viewpoints: readonly { id: string }[] };

export function initialStates(item: { viewpoints: readonly { id: string }[] }): ViewpointStates {
  return Object.fromEntries(item.viewpoints.map((viewpoint) => [viewpoint.id, "not_asked"]));
}

// どの項目も同じ基準を使う。最も重い観点（primaryViewpoints）が否定なら「いいえ」、不明なら「要確認」
export function computeVerdict(item: VerdictRule, states: ViewpointStates): Verdict {
  const primary = item.primaryViewpoints.map((id) => states[id]);
  if (primary.includes("denied")) return "no";
  if (primary.includes("unknown")) return "unknown";

  const others = item.viewpoints.filter((viewpoint) => !item.primaryViewpoints.includes(viewpoint.id));
  if (others.some(({ id }) => states[id] === "denied" || states[id] === "unknown")) return "paper_only";
  if (item.viewpoints.every(({ id }) => states[id] === "confirmed")) return "confirmed_by_answer";
  return "reviewing";
}
