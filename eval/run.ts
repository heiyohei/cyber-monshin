// 問診と返事の検証を台本で動かして測る。費用がかかる。
// 使い方：npm run eval -- --note "変更内容" [--case id] [--repeat 3]
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { emptyUsage, type Usage } from "../src/lib/claude.ts";
import { viewpointResult } from "../src/lib/quote.ts";
import { InterviewStop, runInterview, type InterviewEvent } from "../src/lib/interview.ts";
import { createSession, vendorRequestFor, type InterviewSession } from "../src/lib/session.ts";
import { computeBackupVerdict, VIEWPOINT_IDS, type ViewpointId } from "../src/lib/verdict.ts";
import { verifyVendorReply } from "../src/lib/vendor-reply.ts";
import { CASES, type EvalCase } from "./cases.ts";

const MODEL = "claude-opus-5-5";
const EFFORT = "medium";
const COST_LIMIT = 10;
const CONCURRENCY = 3;
const MAX_ROUNDS = 8;
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const RUNS_DIR = `eval/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;

const KEYWORDS: Record<ViewpointId, RegExp> = {
  procedure: /手順|文書|マニュアル|決まって/,
  isolate: /場所|切り離|離れ|分けて|保管|置いて|置か|つなが|ネットワーク/,
  restore: /戻|復元|復旧|試し/,
  acquire: /誰が|頻度|取って|取得/,
};

function cost(usage: Usage): number {
  return (
    (usage.input * PRICE.input +
      usage.output * PRICE.output +
      usage.cacheRead * PRICE.cacheRead +
      usage.cacheWrite * PRICE.cacheWrite) /
    1_000_000
  );
}

// 質問の順番は Claude が決めるので、質問文の言葉から台本の回答を選ぶ
function pickAnswer(text: string, remaining: ViewpointId[], testCase: EvalCase): { id: string; answer: string } {
  const id = remaining.find((item) => KEYWORDS[item].test(text)) ?? remaining[0];
  if (!id) return { id: "なし", answer: "それ以上のことは分かりません。" };
  remaining.splice(remaining.indexOf(id), 1);
  return { id, answer: testCase.answers[id] };
}

// 原因を調べられるよう、1回ごとのやりとりを手元に残す（eval/runs/ は公開しない）
type TranscriptEntry =
  | { type: "question"; text: string; picked: string; answer: string }
  | { type: "report"; viewpointId: string; status: string; reason: string }
  | { type: "vendor"; requirements: { id: string; viewpointId: string; text: string }[]; results: unknown[] }
  | { type: "event"; text: string };

type RunResult = {
  caseId: string;
  repeat: number;
  states: InterviewSession["states"];
  verdict: string;
  verdictOk: boolean;
  questions: number;
  finished: boolean;
  vendorChecks: { viewpoint: string; expected: string; actual: string }[];
  afterVerdict?: string;
  afterVerdictOk?: boolean;
  fakeQuotes: number;
  error?: string;
  usage: Usage;
  ms: number;
  transcript: TranscriptEntry[];
};

async function runCase(testCase: EvalCase, repeat: number): Promise<RunResult> {
  const session = createSession("yes", "no_item");
  const remaining = [...VIEWPOINT_IDS];
  const usage = emptyUsage();
  const startedAt = Date.now();
  const result: RunResult = {
    caseId: testCase.id,
    repeat,
    states: session.states,
    verdict: "",
    verdictOk: false,
    questions: 0,
    finished: false,
    vendorChecks: [],
    fakeQuotes: 0,
    usage,
    ms: 0,
    transcript: [],
  };
  const log = result.transcript;

  try {
    let answer: string | undefined;
    for (let round = 0; round < MAX_ROUNDS && !session.finished; round += 1) {
      let question = "";
      let continuing = false;
      const emit = (event: InterviewEvent) => {
        if (event.type === "question") question = event.text;
        if (event.type === "can_continue") continuing = true;
        if (event.type === "viewpoint_updated") {
          log.push({ type: "report", viewpointId: event.viewpointId, status: event.status, reason: event.reason });
        }
        if (event.type === "message" || event.type === "error") {
          log.push({ type: "event", text: event.type === "message" ? event.text : event.message });
        }
      };
      await runInterview(session, answer, emit, AbortSignal.timeout(180_000), usage);
      if (!question && !continuing) break;
      if (continuing) {
        answer = undefined;
        continue;
      }
      const picked = pickAnswer(question, remaining, testCase);
      log.push({ type: "question", text: question, picked: picked.id, answer: picked.answer });
      answer = picked.answer;
    }

    result.states = session.states;
    result.verdict = computeBackupVerdict(session.states);
    result.verdictOk = result.verdict === testCase.expected.verdict;
    result.questions = session.questionCount;
    result.finished = session.finished;

    const request = vendorRequestFor(session);
    if (testCase.vendor && request) {
      const { results, states } = await verifyVendorReply(
        testCase.vendor.reply,
        request,
        session.states,
        AbortSignal.timeout(180_000),
        usage,
      );
      log.push({
        type: "vendor",
        requirements: request.requirements.map(({ id, viewpointId, text }) => ({ id, viewpointId, text })),
        results,
      });
      // 観点ごとにまとめた結果で比べる。要件の数は Claude が決めるため
      for (const [viewpoint, expected] of Object.entries(testCase.vendor.results)) {
        const actual = viewpointResult(viewpoint as ViewpointId, request.requirements, results);
        result.vendorChecks.push({ viewpoint, expected, actual: actual ?? "質問に入っていない" });
      }
      result.fakeQuotes = results.filter((item) => item.result === "no_answer" && item.plain.includes("見つかりません")).length;
      result.afterVerdict = computeBackupVerdict(states);
      result.afterVerdictOk = result.afterVerdict === testCase.vendor.verdict;
    }
  } catch (error) {
    result.error = error instanceof InterviewStop ? error.message : error instanceof Error ? error.name : "unknown";
  }
  result.ms = Date.now() - startedAt;
  mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(`${RUNS_DIR}/${testCase.id}-${repeat}.json`, JSON.stringify(result, null, 2));
  return result;
}

function summarize(runs: RunResult[], cases: EvalCase[]) {
  let planted = 0;
  let detected = 0;
  let falsePositives = 0;
  let exact = 0;
  let total = 0;

  for (const run of runs) {
    const expected = cases.find((item) => item.id === run.caseId)!.expected.states;
    for (const id of VIEWPOINT_IDS) {
      const hole = expected[id] !== "confirmed";
      const reported = run.states[id] === "denied" || run.states[id] === "unknown";
      total += 1;
      if (run.states[id] === expected[id]) exact += 1;
      if (hole) planted += 1;
      if (hole && reported) detected += 1;
      if (!hole && reported) falsePositives += 1;
    }
  }

  let unstable = 0;
  for (const testCase of cases) {
    const group = runs.filter((run) => run.caseId === testCase.id);
    for (const id of VIEWPOINT_IDS) {
      if (new Set(group.map((run) => run.states[id])).size > 1) unstable += 1;
    }
  }

  const checks = runs.flatMap((run) => run.vendorChecks);
  const rate = (ok: number, all: number) => (all === 0 ? null : Number((ok / all).toFixed(3)));
  return {
    detection: rate(detected, planted),
    false_positives: falsePositives,
    viewpoint_exact: rate(exact, total),
    verdict_ok: rate(runs.filter((run) => run.verdictOk).length, runs.length),
    unstable_viewpoints: unstable,
    vendor_ok: rate(checks.filter((item) => item.actual === item.expected).length, checks.length),
    after_verdict_ok: rate(
      runs.filter((run) => run.afterVerdictOk).length,
      runs.filter((run) => run.afterVerdict !== undefined).length,
    ),
    finished: rate(runs.filter((run) => run.finished).length, runs.length),
    errors: runs.filter((run) => run.error).length,
    max_questions: Math.max(...runs.map((run) => run.questions)),
    avg_ms: Math.round(runs.reduce((sum, run) => sum + run.ms, 0) / runs.length),
    cost_usd: Number(runs.reduce((sum, run) => sum + cost(run.usage), 0).toFixed(3)),
  };
}

const { values } = parseArgs({
  options: {
    note: { type: "string" },
    case: { type: "string" },
    repeat: { type: "string", default: "3" },
  },
});
if (!values.note) throw new Error("--note で変更内容を指定してください");

const cases = values.case ? CASES.filter((item) => item.id === values.case) : CASES;
const repeat = Number(values.repeat);
const tasks = cases.flatMap((testCase) => Array.from({ length: repeat }, (_, index) => ({ testCase, index })));
const runs: RunResult[] = [];
let spent = 0;
let stopped = false;

async function worker() {
  while (tasks.length > 0 && !stopped) {
    const task = tasks.shift()!;
    const run = await runCase(task.testCase, task.index + 1);
    runs.push(run);
    spent += cost(run.usage);
    if (spent > COST_LIMIT) stopped = true;
    const vendor = run.vendorChecks.map((item) => `${item.viewpoint}:${item.actual}`).join(" ");
    const states = VIEWPOINT_IDS.map((id) => `${id}:${run.states[id]}`).join(" ");
    console.log(
      `${run.caseId}#${run.repeat} 判定=${run.verdict}${run.verdictOk ? "" : "（不一致）"} 質問=${run.questions} ` +
        `終了=${run.finished} 返事後=${run.afterVerdict ?? "-"}${run.afterVerdictOk === false ? "（不一致）" : ""} ` +
        `${vendor} ${run.error ?? ""} $${cost(run.usage).toFixed(3)} ${run.ms}ms`,
    );
    console.log(`  状態 ${states}`);
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const summary = summarize(runs, cases);
const entry = {
  date: new Date().toISOString(),
  change: values.note,
  model: MODEL,
  effort: EFFORT,
  cases: cases.length,
  repeat,
  runs: runs.length,
  stopped_by_cost_limit: stopped,
  ...summary,
};
mkdirSync("eval", { recursive: true });
appendFileSync("eval/history.jsonl", `${JSON.stringify(entry)}\n`);
console.log(JSON.stringify(entry, null, 2));
