import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyResults,
  checkResults,
  decidedViewpoints,
  withReplySources,
  quoteExists,
  viewpointResult,
  type ReadResult,
  type Requirement,
} from "./quote.ts";
import { BACKUP_ITEM } from "../data/backup.ts";
import { initialStates } from "./verdict.ts";

const REPLY = "バックアップは毎日、夜間に取得しています。\n復元の試験は未実施です。ＮＡＳに保存しています。";
const REQUIREMENTS: Requirement[] = [
  { id: "r_acquire", viewpointId: "acquire", text: "毎日取得", followUp: "取得の頻度を教えてください。" },
  { id: "r_restore", viewpointId: "restore", text: "戻す確認", followUp: "戻す確認の日を教えてください。" },
];

function read(requirement_id: string, result: ReadResult["result"], quote: string): ReadResult {
  return { requirement_id, result, quote, plain: "言い換え", follow_up: "" };
}

test("引用：改行、空白、全角と半角の違いを無視して見つける", () => {
  assert.equal(quoteExists("取得しています。 復元の試験", REPLY), true);
  assert.equal(quoteExists("NASに保存", REPLY), true);
});

test("引用：空の引用と、返事にない引用は認めない", () => {
  assert.equal(quoteExists("", REPLY), false);
  assert.equal(quoteExists("毎月、復元の試験をしています", REPLY), false);
});

test("検証：偽の引用は「回答なし」に直り、観点の状態を変えない", () => {
  const results = [read("r_acquire", "met", "毎週取得しています")];
  const checked = checkResults(REQUIREMENTS.slice(0, 1), results, REPLY);
  assert.equal(checked[0].result, "no_answer");
  assert.equal(checked[0].quote, "");
  assert.equal(checked[0].follow_up, "取得の頻度を教えてください。");
  assert.deepEqual(applyResults(initialStates(BACKUP_ITEM), REQUIREMENTS, checked), initialStates(BACKUP_ITEM));
});

test("検証：読み取りが返らなかった要件は「回答なし」になる", () => {
  const checked = checkResults(REQUIREMENTS, [], REPLY);
  assert.deepEqual(checked.map((item) => item.result), ["no_answer", "no_answer"]);
});

test("検証：同じ観点の要件が複数あれば、甘くならない側にまとめる", () => {
  const twice: Requirement[] = [
    { id: "a", viewpointId: "restore", text: "戻したことがある", followUp: "" },
    { id: "b", viewpointId: "restore", text: "1年以内に戻した", followUp: "" },
  ];
  const states = (first: ReadResult["result"], second: ReadResult["result"]) =>
    applyResults(initialStates(BACKUP_ITEM), twice, [read("a", first, ""), read("b", second, "")]).restore;

  assert.equal(states("not_met", "met"), "denied");
  assert.equal(states("met", "not_met"), "denied");
  assert.equal(states("met", "ambiguous"), "not_asked");
  assert.equal(states("met", "no_answer"), "not_asked");
  assert.equal(states("met", "met"), "confirmed");
  assert.equal(viewpointResult("restore", twice, [read("a", "met", "")]), "no_answer");
  assert.equal(viewpointResult("isolate", twice, []), null);
});

test("検証：満たされない要件には、追加の質問が必ず付く", () => {
  const notMet = read("r_restore", "not_met", "復元の試験は未実施");
  const checked = checkResults(REQUIREMENTS.slice(1), [notMet], REPLY);
  assert.equal(checked[0].follow_up, "戻す確認の日を教えてください。");
});

test("検証：満たす、満たさない、曖昧を対応づけて状態を更新する", () => {
  const met = read("r_acquire", "met", "毎日、夜間に取得");
  const notMet = read("r_restore", "not_met", "復元の試験は未実施");
  const states = applyResults(initialStates(BACKUP_ITEM), REQUIREMENTS, checkResults(REQUIREMENTS, [met, notMet], REPLY));
  assert.equal(states.acquire, "confirmed");
  assert.equal(states.restore, "denied");

  const ambiguous = read("r_restore", "ambiguous", "復元の試験は未実施");
  const unchanged = applyResults(initialStates(BACKUP_ITEM), REQUIREMENTS, checkResults(REQUIREMENTS, [ambiguous], REPLY));
  assert.equal(unchanged.restore, "not_asked");
});

test("検証：返事で満たす、満たさないが決まった観点だけを、出どころが返事の観点にする", () => {
  const met = read("r_acquire", "met", "毎日、夜間に取得");
  const notMet = read("r_restore", "not_met", "復元の試験は未実施");
  const ambiguous = read("r_restore", "ambiguous", "復元の試験は未実施");
  assert.deepEqual(decidedViewpoints(REQUIREMENTS, checkResults(REQUIREMENTS, [met, notMet], REPLY)), ["acquire", "restore"]);
  assert.deepEqual(decidedViewpoints(REQUIREMENTS, checkResults(REQUIREMENTS, [ambiguous], REPLY)), []);
  const fake = read("r_acquire", "met", "毎週取得しています");
  assert.deepEqual(decidedViewpoints(REQUIREMENTS, checkResults(REQUIREMENTS, [fake], REPLY)), []);
});

test("検証：返事で決まった観点だけ出どころを返事にし、ほかは回答のまま残す", () => {
  const sources = withReplySources({ acquire: "answer", restore: "answer" }, ["restore"]);
  assert.deepEqual(sources, { acquire: "answer", restore: "reply" });
  assert.deepEqual(withReplySources(undefined, []), {});
});
