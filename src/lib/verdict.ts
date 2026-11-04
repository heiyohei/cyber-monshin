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

// 判定の名前が何を意味するかの1文（固定の文）。判定カードと説明用の1枚で、名前のすぐ下に出す。
// どの観点ができていないかなど、このカードだけのことは、画面の判定の説明（verdictNote）が言う。
// 準拠の保証や法的判断に読めないよう、「確かめた範囲で分かったこと」の言い方にする。
// reviewing の名前は「去年の回答：…」なので、去年の答えであることを言う
export const VERDICT_MEANINGS: Record<Verdict, string> = {
  reviewing: "去年のチェックリストに書いた答えです。まだ確かめた結果ではありません。",
  confirmed_by_answer: "今回確かめたことは、すべてできていると分かった、という意味です。",
  paper_only: "チェックリストでは「はい」にあたりますが、確かめると、足りない備えや分からない備えがある、という意味です。",
  no: "確かめた結果、この対策でいちばん大事な備えが、できていないという意味です。",
  unknown: "この対策でいちばん大事な備えが、できているか分からないという意味です。",
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
