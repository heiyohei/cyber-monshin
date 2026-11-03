import type { ViewpointStates } from "./verdict.ts";

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
