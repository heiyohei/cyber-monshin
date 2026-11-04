// 問診の待ち時間を区間ごとに測る。費用がかかる（5場面の問診1回で、fast mode の Opus は約 $0.2）。
// 使い方：npm run eval:perf -- [--runs 3] [--rounds 4] [--item backup] [--standard] [--model claude-sonnet-5-5]
// アプリは Opus を fast mode で呼ぶ。--standard はふつうの速さで測る。--model は別のモデルで速さだけを測る（質は npm run eval で比べる。fast mode は Opus だけ）
// 区間：応答の始まりまで（通信と入力の読み込み）、考える時間（最初の出力のブロックまで）、書く時間（最後まで）、コードの処理
import { parseArgs } from "node:util";
import { client, emptyUsage } from "../src/lib/claude.ts";
import { runInterview, type InterviewEvent } from "../src/lib/interview.ts";
import { createSession } from "../src/lib/session.ts";
import { findItem } from "../src/data/items.ts";


type Call = {
  round: number;
  startMs: number;
  thinkMs: number;
  writeMs: number;
  totalMs: number;
  blocks: string[];
  output: number;
  input: number;
  cacheRead: number;
};

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "3" },
    rounds: { type: "string", default: "4" },
    item: { type: "string", default: "backup" },
    standard: { type: "boolean", default: false },
    model: { type: "string" },
  },
});

// 100万トークンあたりの単価（キャッシュの書き込みは入力の1.25倍）
const PRICE = values.model?.includes("haiku")
  ? { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }
  : values.model?.includes("sonnet")
    ? { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }
    : { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

const calls: Call[] = [];
let currentRound = 0;

// 呼び出しの流れの出来事に時刻を付ける。中身（回答や質問の文）は記録しない
const original = client.beta.messages.stream.bind(client.beta.messages);
client.beta.messages.stream = ((params: Parameters<typeof original>[0], options?: Parameters<typeof original>[1]) => {
  const { speed, ...rest } = params;
  const model = values.model ?? params.model;
  const request = { ...rest, model, ...(model === "claude-opus-5-5" && !values.standard ? { speed } : {}) };
  const stream = original(request as typeof params, options);
  const t0 = performance.now();
  let started = 0;
  let firstOutput = 0;
  const blocks: string[] = [];
  stream.on("streamEvent", (event) => {
    const now = performance.now();
    if (event.type === "message_start") started = now;
    if (event.type === "content_block_start") {
      const block = event.content_block;
      blocks.push(block.type === "tool_use" ? block.name : block.type);
      if (!firstOutput && event.content_block.type !== "thinking" && event.content_block.type !== "redacted_thinking") {
        firstOutput = now;
      }
    }
  });
  // ブロックを書き終えた時刻（呼び出しの始まりからの秒）。ブロックの名前のあとに付ける
  stream.on("contentBlock", () => {
    blocks[blocks.length - 1] += `@${((performance.now() - t0) / 1000).toFixed(1)}`;
  });
  stream.on("finalMessage", (message) => {
    const end = performance.now();
    const start = started || end;
    const first = firstOutput || end;
    calls.push({
      round: currentRound,
      startMs: start - t0,
      thinkMs: first - start,
      writeMs: end - first,
      totalMs: end - t0,
      blocks: [...blocks, `speed=${message.usage.speed ?? "-"}`],
      output: message.usage.output_tokens,
      input: message.usage.input_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
    });
  });
  return stream;
}) as typeof client.beta.messages.stream;

const item = findItem(values.item)!;
const rounds: { run: number; round: number; ms: number; apiMs: number; calls: number }[] = [];
const usage = emptyUsage();

for (let run = 1; run <= Number(values.runs); run += 1) {
  const session = createSession(item, "yes", item.sample.vendorAnswer);
  let answer: string | undefined;
  for (let round = 0; round < Number(values.rounds) && !session.finished; round += 1) {
    currentRound = round;
    let options: string[] = [];
    const emit = (event: InterviewEvent) => {
      if (event.type === "question") options = event.options;
    };
    const before = calls.length;
    const t0 = performance.now();
    await runInterview(session, answer, emit, AbortSignal.timeout(180_000), usage);
    const ms = performance.now() - t0;
    const mine = calls.slice(before);
    rounds.push({ run, round, ms, apiMs: mine.reduce((sum, call) => sum + call.totalMs, 0), calls: mine.length });
    if (!options.length) break;
    // 最初の選択肢で答える（速さを測るためなので、中身は問わない）
    answer = options[0];
  }
}

const sec = (ms: number) => (ms / 1000).toFixed(1);
console.log("\n呼び出しごと（秒）：場面 / 始まりまで / 考える / 書く / 合計 / 出力トークン / 入力 / キャッシュ読み / ブロック");
for (const call of calls) {
  console.log(
    [
      call.round === 0 ? "最初" : `回答${call.round}`,
      sec(call.startMs),
      sec(call.thinkMs),
      sec(call.writeMs),
      sec(call.totalMs),
      call.output,
      call.input,
      call.cacheRead,
      call.blocks.join("+"),
    ].join("\t"),
  );
}
console.log("\n画面の1回の待ち（秒）：問診 / 場面 / 全体 / うち Claude / 呼び出し回数");
for (const round of rounds) {
  console.log([round.run, round.round === 0 ? "最初" : `回答${round.round}`, sec(round.ms), sec(round.apiMs), round.calls].join("\t"));
}
const avg = (pick: (call: Call) => number) => sec(calls.reduce((sum, call) => sum + pick(call), 0) / calls.length);
console.log(`\n平均（呼び出し1回）：始まりまで ${avg((c) => c.startMs)}、考える ${avg((c) => c.thinkMs)}、書く ${avg((c) => c.writeMs)}、合計 ${avg((c) => c.totalMs)}`);
const cost =
  (!values.model?.includes("sonnet") && !values.model?.includes("haiku") && !values.standard ? 2 : 1) *
  (usage.input * PRICE.input + usage.output * PRICE.output + usage.cacheRead * PRICE.cacheRead + usage.cacheWrite * PRICE.cacheWrite) /
  1_000_000;
console.log(`呼び出し ${usage.calls}回、費用 約 $${cost.toFixed(3)}（単価からの計算）`);
