import type { ViewpointSources, ViewpointStates } from "./verdict.ts";

export type RequirementResult = "met" | "not_met" | "ambiguous" | "no_answer";

export type ReadResult = {
  requirement_id: string;
  result: RequirementResult;
  quote: string;
  plain: string;
  follow_up: string;
};

export type Requirement = { id: string; viewpointId: string; text: string; followUp: string };

function normalize(text: string): string {
  return text.normalize("NFKC").replace(/\s/g, "");
}

export function quoteExists(quote: string, reply: string): boolean {
  const normalized = normalize(quote);
  return normalized.length > 0 && normalize(reply).includes(normalized);
}

// 実在しない引用は表示せず「回答なし」にする。読み取りが返らなかった要件も同じ扱い。
export function checkResults(
  requirements: Requirement[],
  results: ReadResult[],
  reply: string,
): ReadResult[] {
  return requirements.map((requirement) => {
    const found = results.find((result) => result.requirement_id === requirement.id);
    const noAnswer: ReadResult = {
      requirement_id: requirement.id,
      result: "no_answer",
      quote: "",
      plain: "この点についての答えは、返事の中に見つかりませんでした。",
      follow_up: found?.follow_up || requirement.followUp,
    };
    if (!found || found.result === "no_answer" || !quoteExists(found.quote, reply)) return noAnswer;
    if (found.result === "met") return found;
    return { ...found, follow_up: found.follow_up || requirement.followUp };
  });
}

// AI への指示のように読める文の報告。返事に実在する引用だけを残し、同じ文は1つにまとめる。
// 画面で知らせるだけで、判定にも要件の読み取りにも使わない。捨てた数は呼び出し側がログに数だけ出す
export function checkSuspicious(quotes: string[], reply: string): { quotes: string[]; dropped: number } {
  const kept: string[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const quote of quotes) {
    if (!quoteExists(quote, reply)) {
      dropped += 1;
      continue;
    }
    const key = normalize(quote);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(quote);
  }
  return { quotes: kept, dropped };
}

// 報告の引用と、要件の根拠の引用（確かめたあとのもの）が重なっているか（どちらかが他方を含む）。
// 重なっていれば、画面で「読み取りに使っていない」と言い切らず、返事と見比べるよう促すための印。判定には使わない
export function quotesOverlap(results: ReadResult[], suspicious: string[]): boolean {
  const evidence = results.map((result) => normalize(result.quote)).filter((quote) => quote.length > 0);
  return suspicious.some((quote) => {
    const normalized = normalize(quote);
    return normalized.length > 0 && evidence.some((item) => item.includes(normalized) || normalized.includes(item));
  });
}

// 1つの観点に要件が複数あるときは、甘くならない側にまとめる。
// 1つでも満たさなければ「満たさない」、すべて満たすときだけ「満たす」
export function viewpointResult(
  viewpointId: string,
  requirements: Requirement[],
  results: ReadResult[],
): RequirementResult | null {
  const found = requirements
    .filter((requirement) => requirement.viewpointId === viewpointId)
    .map((requirement) => results.find((item) => item.requirement_id === requirement.id)?.result ?? "no_answer");
  if (found.length === 0) return null;
  if (found.includes("not_met")) return "not_met";
  if (found.every((result) => result === "met")) return "met";
  return found.includes("ambiguous") ? "ambiguous" : "no_answer";
}

// 返事で「満たす」か「満たさない」が決まった観点。確認の出どころを「ベンダーの返事」にする
export function decidedViewpoints(requirements: Requirement[], results: ReadResult[]): string[] {
  return [...new Set(requirements.map((requirement) => requirement.viewpointId))].filter((viewpointId) => {
    const result = viewpointResult(viewpointId, requirements, results);
    return result === "met" || result === "not_met";
  });
}

// 返事で決まらなかった観点は、前の出どころ（回答）のまま残す
export function withReplySources(sources: ViewpointSources | undefined, decided: string[]): ViewpointSources {
  return { ...sources, ...Object.fromEntries(decided.map((id) => [id, "reply" as const])) };
}

export function applyResults(
  states: ViewpointStates,
  requirements: Requirement[],
  results: ReadResult[],
): ViewpointStates {
  const next = { ...states };
  for (const viewpointId of new Set(requirements.map((requirement) => requirement.viewpointId))) {
    const result = viewpointResult(viewpointId, requirements, results);
    if (result === "met") next[viewpointId] = "confirmed";
    if (result === "not_met") next[viewpointId] = "denied";
  }
  return next;
}
