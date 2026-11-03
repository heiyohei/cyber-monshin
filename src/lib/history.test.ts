import assert from "node:assert/strict";
import { test } from "node:test";
import { appendHistory, attachReadings, upsertReading, type HistoryEntry } from "./history.ts";

const QUESTION = { text: "控えから戻す確認をしたことはありますか？", why: "控えがあっても、戻せなければ診療が止まるためです" };

test("控える：質問と回答が1問目から順に並び、読み取りはまだない", () => {
  const first = appendHistory([], QUESTION, "はい、去年の春に試しました");
  const second = appendHistory(first, { text: "誰が取っていますか？", why: "担当が決まっているかを確かめます" }, "ベンダーです");
  assert.equal(second.length, 2);
  assert.deepEqual(second[0], { question: QUESTION, answer: "はい、去年の春に試しました", readings: null });
  assert.equal(second[1].question.text, "誰が取っていますか？");
  assert.equal(second[1].readings, null);
});

test("控える：元の配列は変えないので、送信に失敗したら元の配列に戻せる（やり直しで二重に入らない）", () => {
  const before: HistoryEntry[] = [];
  const pending = appendHistory(before, QUESTION, "はい");
  assert.equal(before.length, 0);
  assert.equal(pending.length, 1);
  // 失敗したあとのやり直しは、元の配列から控え直す
  const retried = appendHistory(before, QUESTION, "はい");
  assert.equal(retried.length, 1);
});

test("読み取りを付ける：最後の回に付き、前の回は変わらない", () => {
  const history = appendHistory(appendHistory([], QUESTION, "はい"), { text: "次の質問", why: "理由" }, "いいえ");
  const attached = attachReadings(history, [{ viewpointId: "restore", status: "confirmed", reason: "戻す確認をしたとの回答でした" }]);
  assert.equal(attached[0].readings, null);
  assert.deepEqual(attached[1].readings, [{ viewpointId: "restore", status: "confirmed", reason: "戻す確認をしたとの回答でした" }]);
  // 元の配列は変えない
  assert.equal(history[1].readings, null);
});

test("読み取りを付ける：0件でも「届いた」と分かるように空の配列になる。控えがなければ何もしない", () => {
  const attached = attachReadings(appendHistory([], QUESTION, "はい"), []);
  assert.deepEqual(attached[0].readings, []);
  assert.deepEqual(attachReadings([], [{ viewpointId: "restore", status: "unknown", reason: "" }]), []);
});

test("読み取りを足す：同じ観点が2回届いたら、あとの方に置き換える", () => {
  const first = upsertReading([], { viewpointId: "restore", status: "unknown", reason: "分からないとの回答" });
  const second = upsertReading(first, { viewpointId: "acquire", status: "confirmed", reason: "毎日取っている" });
  const third = upsertReading(second, { viewpointId: "restore", status: "confirmed", reason: "去年試した" });
  assert.deepEqual(
    third.map((reading) => `${reading.viewpointId}:${reading.status}`),
    ["acquire:confirmed", "restore:confirmed"],
  );
});
