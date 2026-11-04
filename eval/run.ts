// 問診と返事の検証を台本で動かして測る。費用がかかる。
// 使い方：npm run eval -- --note "変更内容" [--case id] [--repeat 3] [--model claude-sonnet-5-5] [--fast]
// --model は、問診と返事の読み解きのモデルだけを差し替えて比べる（アプリの設定は変えない）。
// fast mode は書く速さだけを変え、答えの中身は変わらない（公式の資料）ので、評価はふつうの速さで動かす（費用が半分）。
// アプリと同じ fast mode で測るときは --fast を付ける
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { client, emptyUsage, type Usage } from "../src/lib/claude.ts";
import { viewpointResult } from "../src/lib/quote.ts";
import {
  GAVE_UP_MESSAGE,
  InterviewStop,
  QUOTE_ERROR,
  QUOTE_TOO_LONG,
  runInterview,
  type InterviewEvent,
} from "../src/lib/interview.ts";
import { createSession, vendorRequestFor, type InterviewSession } from "../src/lib/session.ts";
import { computeVerdict } from "../src/lib/verdict.ts";
import { findItem } from "../src/data/items.ts";
import { verifyVendorReply } from "../src/lib/vendor-reply.ts";
import { CASES, type EvalCase } from "./cases.ts";

const { values } = parseArgs({
  options: {
    note: { type: "string" },
    case: { type: "string", multiple: true },
    repeat: { type: "string", default: "3" },
    model: { type: "string", default: "claude-opus-5-5" },
    fast: { type: "boolean", default: false },
  },
});
if (!values.note) throw new Error("--note で変更内容を指定してください");

const MODEL = values.model;
const EFFORT = "medium";
const COST_LIMIT = 10;
const CONCURRENCY = 3;
const MAX_ROUNDS = 8;
// 100万トークンあたりの単価（claude-api の資料から）。キャッシュの書き込みは入力の1.25倍
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
const FAST = values.fast && MODEL === "claude-opus-5-5";
if (values.fast && !FAST) throw new Error("--fast は claude-opus-5-5 だけで使えます");
const BASE_PRICE = PRICES[MODEL];
if (!BASE_PRICE) throw new Error(`--model は ${Object.keys(PRICES).join("、")} のどれかにしてください`);
// fast mode は単価が2倍（キャッシュの倍率も上に掛かる）。ふつうの速さに切り替わった回も2倍で数える
const PRICE = FAST ? Object.fromEntries(Object.entries(BASE_PRICE).map(([key, value]) => [key, value * 2])) as typeof BASE_PRICE : BASE_PRICE;

// 問診（interview.ts）と返事の読み解き（vendor-reply.ts）の呼び出しのモデルを差し替える。
// --fast のときだけ、アプリと同じ速さの指定を残す（fast mode は Opus だけ）
const stream = client.beta.messages.stream.bind(client.beta.messages);
client.beta.messages.stream = ((params: Parameters<typeof stream>[0], options?: Parameters<typeof stream>[1]) => {
  const { speed, ...rest } = params;
  return stream({ ...rest, model: MODEL, ...(FAST ? { speed } : {}) }, options);
}) as typeof client.beta.messages.stream;
const RUNS_DIR = `eval/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;

// 質問文から、どの観点を聞いているかを言葉で見分ける。項目ごとに持つ
const KEYWORDS: Record<string, Record<string, RegExp>> = {
  backup: {
    acquire: /誰が|頻度|取って|取得/,
    restore: /戻|復元|復旧|試し/,
    isolate: /場所|切り離|離れ|分けて|保管|置いて|置か|つなが|ネットワーク/,
    procedure: /手順|文書|マニュアル|決まって/,
  },
  update: {
    apply: /誰が|頻度|当て|行って|適用/,
    responsibility: /対象外|保守|契約|範囲|担当|任せ/,
    inventory: /一覧|台帳|把握|サポート|古い|EOS|機器の種類/,
    verify: /動作|不具合|あと|後|正しく動/,
  },
  // 下の3項目は、紛らわしい言葉を含む観点を先に並べる（見分けはこの順で行う）
  devices: {
    ledger: /一覧|台帳|置き場所/,
    entry_points: /入口|回線|部署/,
    source_limit: /つなげ|つない|接続|Wi|私物/,
    remote: /外から|遠隔|リモート|点検|保守/,
  },
  accounts: {
    two_factor: /カード|指紋|本人|二要素|加えて/,
    cleanup: /退職|辞め|使っていない|使われていない|不要|ID/,
    reuse: /使い回|同じパスワード|パスワード/,
    admin: /管理者|権限|設定を変/,
  },
  continuity: {
    drill: /訓練|練習/,
    vendor_bcp: /ベンダー.*(計画|備え)|業者.*(計画|備え)/,
    contacts: /連絡/,
    plan: /計画|文書|続け|決め/,
  },
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
function pickAnswer(text: string, remaining: string[], testCase: EvalCase): { id: string; answer: string } {
  const keywords = KEYWORDS[testCase.itemId ?? "backup"];
  const id =
    Object.keys(keywords).find((item) => remaining.includes(item) && keywords[item].test(text)) ?? remaining[0];
  if (!id) return { id: "なし", answer: "それ以上のことは分かりません。" };
  remaining.splice(remaining.indexOf(id), 1);
  return { id, answer: testCase.answers[id] };
}

// 原因を調べられるよう、1回ごとのやりとりを手元に残す（eval/runs/ は公開しない）
type TranscriptEntry =
  | { type: "question"; text: string; options: string[]; picked: string; answer: string }
  | { type: "report"; viewpointId: string; status: string; reason: string; quote: string }
  | {
      type: "vendor";
      requirements: { id: string; viewpointId: string; text: string }[];
      results: unknown[];
      suspicious: string[];
      // 報告の文が、要件の根拠の原文と重なっていたか（画面の言い方が変わる）
      suspiciousOverlap: boolean;
    }
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
  // 返事の中の AI への指示のような文の報告（返事に実在した引用の数）と、ケースの期待どおりか（あるべきときにあり、ないべきときにない）
  suspicious?: number;
  suspiciousOk?: boolean;
  // ツールの入力を受け付けずにやり直させた回数（全体と、そのうち根拠の言葉を受け付けなかった分）と、
  // やり直しが続いて問診を止めたか（giveUp。finished は true になるので、別に数える）
  toolErrors: number;
  quoteRejections: number;
  gaveUp: boolean;
  error?: string;
  usage: Usage;
  ms: number;
  transcript: TranscriptEntry[];
};

async function runCase(testCase: EvalCase, repeat: number): Promise<RunResult> {
  const item = findItem(testCase.itemId ?? "backup")!;
  const session = createSession(item, "yes", testCase.vendorAnswer ?? item.sample.vendorAnswer);
  const remaining = item.viewpoints.map((viewpoint) => viewpoint.id);
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
    toolErrors: 0,
    quoteRejections: 0,
    gaveUp: false,
    usage,
    ms: 0,
    transcript: [],
  };
  const log = result.transcript;

  try {
    let answer: string | undefined;
    for (let round = 0; round < MAX_ROUNDS && !session.finished; round += 1) {
      let question = "";
      let options: string[] = [];
      let continuing = false;
      const emit = (event: InterviewEvent) => {
        if (event.type === "question") {
          question = event.text;
          options = event.options;
        }
        if (event.type === "can_continue") continuing = true;
        if (event.type === "viewpoint_updated") {
          log.push({
            type: "report",
            viewpointId: event.viewpointId,
            status: event.status,
            reason: event.reason,
            quote: event.quote,
          });
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
      log.push({ type: "question", text: question, options, picked: picked.id, answer: picked.answer });
      answer = picked.answer;
    }

    result.states = session.states;
    result.verdict = computeVerdict(item, session.states);
    result.verdictOk = result.verdict === testCase.expected.verdict;
    result.questions = session.questionCount;
    result.finished = session.finished;

    const request = vendorRequestFor(session);
    if (testCase.vendor && request) {
      const { results, states, suspicious } = await verifyVendorReply(
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
        suspicious: suspicious.quotes,
        suspiciousOverlap: suspicious.overlap,
      });
      // 偽の指示を含むケースでは報告があり、ほかのケースでは報告がないことを数える
      result.suspicious = suspicious.quotes.length;
      result.suspiciousOk = suspicious.quotes.length > 0 === Boolean(testCase.vendor.suspicious);
      // 観点ごとにまとめた結果で比べる。要件の数は Claude が決めるため
      for (const [viewpoint, expected] of Object.entries(testCase.vendor.results)) {
        const actual = viewpointResult(viewpoint, request.requirements, results);
        result.vendorChecks.push({ viewpoint, expected: expected ?? "", actual: actual ?? "質問に入っていない" });
      }
      result.fakeQuotes = results.filter((item) => item.result === "no_answer" && item.plain.includes("見つかりません")).length;
      result.afterVerdict = computeVerdict(item, states);
      result.afterVerdictOk = result.afterVerdict === testCase.vendor.verdict;
    }
  } catch (error) {
    result.error = error instanceof InterviewStop ? error.message : error instanceof Error ? error.name : "unknown";
  }
  // 受け付けなかったツールの入力を、会話の履歴から数える（途中で止まった回も数える）
  // 回答待ちで終わった回の結果（pendingResults）は、まだ履歴に積まれていないので足す
  const errors = [
    ...session.messages.flatMap((message) =>
      message.role === "user" && typeof message.content !== "string"
        ? message.content.filter((block) => block.type === "tool_result" && block.is_error)
        : [],
    ),
    ...session.pendingResults.filter((block) => block.is_error),
  ];
  result.toolErrors = errors.length;
  result.quoteRejections = errors.filter(
    (block) => block.type === "tool_result" && (block.content === QUOTE_ERROR || block.content === QUOTE_TOO_LONG),
  ).length;
  result.gaveUp = log.some((entry) => entry.type === "event" && entry.text === GAVE_UP_MESSAGE);
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
    for (const id of Object.keys(expected)) {
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
    for (const id of Object.keys(testCase.expected.states)) {
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
    // 返事のあるケースのうち、指示のような文の報告が期待どおりだった割合と、期待していないのに報告があった数
    suspicious_ok: rate(
      runs.filter((run) => run.suspiciousOk).length,
      runs.filter((run) => run.suspicious !== undefined).length,
    ),
    suspicious_unexpected: runs.filter((run) => run.suspicious !== undefined && run.suspicious > 0 && !run.suspiciousOk).length,
    finished: rate(runs.filter((run) => run.finished).length, runs.length),
    questions_with_options: rate(
      runs.flatMap((run) => run.transcript).filter((entry) => entry.type === "question" && entry.options.length >= 2).length,
      runs.flatMap((run) => run.transcript).filter((entry) => entry.type === "question").length,
    ),
    errors: runs.filter((run) => run.error).length,
    // 受け付けずにやり直させたツールの入力の数（全体と、根拠の言葉を受け付けなかった分）と、やり直しが続いて止めた回の数
    tool_errors: runs.reduce((sum, run) => sum + run.toolErrors, 0),
    quote_rejections: runs.reduce((sum, run) => sum + run.quoteRejections, 0),
    gave_up: runs.filter((run) => run.gaveUp).length,
    max_questions: Math.max(...runs.map((run) => run.questions)),
    avg_ms: Math.round(runs.reduce((sum, run) => sum + run.ms, 0) / runs.length),
    cost_usd: Number(runs.reduce((sum, run) => sum + cost(run.usage), 0).toFixed(3)),
  };
}


// --case は ID の先頭で選ぶ。varied_ なら揺れのあるケースだけを動かす。複数指定すると、どれかに当たるケースを動かす
const prefixes = values.case ?? [];
const cases = prefixes.length > 0 ? CASES.filter((item) => prefixes.some((prefix) => item.id.startsWith(prefix))) : CASES;
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
    const states = Object.entries(run.states).map(([id, status]) => `${id}:${status}`).join(" ");
    console.log(
      `${run.caseId}#${run.repeat} 判定=${run.verdict}${run.verdictOk ? "" : "（不一致）"} 質問=${run.questions} ` +
        `終了=${run.finished} 返事後=${run.afterVerdict ?? "-"}${run.afterVerdictOk === false ? "（不一致）" : ""} ` +
        `指示の報告=${run.suspicious ?? "-"}${run.suspiciousOk === false ? "（不一致）" : ""} ` +
        `やり直し=${run.toolErrors}（根拠の言葉=${run.quoteRejections}）${run.gaveUp ? "（途中で止めた）" : ""} ` +
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
  speed: FAST ? "fast" : "standard",
  cases: cases.length,
  repeat,
  runs: runs.length,
  stopped_by_cost_limit: stopped,
  ...summary,
};
mkdirSync("eval", { recursive: true });
appendFileSync("eval/history.jsonl", `${JSON.stringify(entry)}\n`);
console.log(JSON.stringify(entry, null, 2));
