import type { CheckItem, Evidence, FocusItem } from "../data/types.ts";
import { computeResult, type Result } from "./result.ts";
import type { VendorRequest } from "./session.ts";
import {
  computeVerdict,
  VERDICT_LABELS,
  type Verdict,
  type ViewpointSource,
  type ViewpointSources,
  type ViewpointStates,
  type ViewpointStatus,
} from "./verdict.ts";

export type Card = {
  itemId: string;
  itemName: string;
  verdict: Verdict;
  label: string;
  checkItems: readonly CheckItem[];
  itemEvidence: Evidence;
  // goal は観点名（取得、切り離しなど）だけでは伝わらないときの説明。画面で名前の下に出す
  viewpoints: {
    id: string;
    name: string;
    goal: string;
    status: ViewpointStatus;
    source: ViewpointSource | null;
    evidence: Evidence;
  }[];
  result: Result;
};

const STATUS_LABELS: Record<ViewpointStatus, string> = {
  not_asked: "まだ確かめていません",
  confirmed: "回答で確認",
  denied: "できていない",
  unknown: "わからない",
};

// 「はい」の裏を見えるようにするため、ベンダーの返事で決まった状態はそう示す。
// 返事は実地の確認ではないので「確認」と言い切らない
export function statusLabel(status: ViewpointStatus, source: ViewpointSource | null = null): string {
  if (source !== "reply") return STATUS_LABELS[status];
  if (status === "confirmed") return "できている（ベンダーの返事から）";
  if (status === "denied") return "できていない（ベンダーの返事から）";
  return STATUS_LABELS[status];
}

// 根拠は固定データだけから作る。判定もここで計算し直す。
export function buildCard(
  item: FocusItem,
  states: ViewpointStates,
  lastYearAnswer: string,
  sources: ViewpointSources = {},
): Card {
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
      goal: viewpoint.goal,
      status: states[viewpoint.id],
      source: states[viewpoint.id] === "not_asked" ? null : (sources[viewpoint.id] ?? null),
      evidence: viewpoint.evidence,
    })),
    result: computeResult(item, states),
  };
}

// ベンダーへ送る文。質問の理由として、聞く観点の根拠（固定データの原文）をコードで添える。
// 返事の読み解きで Claude に渡す質問文は変えない
export function vendorMessage(request: VendorRequest, card: Card): string {
  const ids = new Set(request.requirements.map((requirement) => requirement.viewpointId));
  const evidences = card.viewpoints.filter((viewpoint) => ids.has(viewpoint.id)).map((viewpoint) => viewpoint.evidence);
  const unique = evidences.filter((evidence, index) => evidences.findIndex((item) => item.id === evidence.id) === index);
  if (unique.length === 0) return request.question;
  return [
    request.question,
    "",
    "（参考）質問の背景として、厚生労働省の公開資料から次の記載を引用します。質問の文は当院で作ったもので、厚生労働省が示したものではありません。",
    ...unique.map((evidence) => `・「${evidence.text}」（${evidence.source}）`),
  ].join("\n");
}
