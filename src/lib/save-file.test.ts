import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { computeResult } from "./result.ts";
import { buildSaveFile, SAVE_VERSION, sessionFromSaveFile } from "./save-file.ts";
import { createSession, vendorRequestFor } from "./session.ts";
import { computeVerdict } from "./verdict.ts";

function finishedSession() {
  const session = createSession(BACKUP_ITEM, "yes", "no_item");
  session.states = { acquire: "confirmed", restore: "unknown", isolate: "denied", procedure: "confirmed" };
  session.vendorQuestions = [
    {
      gapType: "no_item",
      concern: "戻せるか不安",
      question: "戻す確認をしたことはありますか？",
      requirements: [{ id: "q1_r1", viewpointId: "restore", text: "戻す確認をした", followUp: "日を教えてください" }],
    },
  ];
  session.sources = { acquire: "reply", restore: "answer", isolate: "answer", procedure: "answer" };
  session.messages = [{ role: "user", content: "会話の履歴" }];
  return session;
}

test("保存：形式の版番号が入り、会話の履歴は入らない", () => {
  const file = buildSaveFile(finishedSession(), { restore: "わからないとの回答" }, "要約");
  assert.equal(file.version, 1);
  assert.equal(JSON.stringify(file).includes("会話の履歴"), false);
  assert.equal(file.items[0].reasons.restore, "わからないとの回答");
});

// 画面の「これまでの質問と回答」はブラウザの中だけで持つ。保存ファイルには、質問の文も回答の文も入らない（形式は版1のまま）
test("保存：これまでの質問と回答は入らない", () => {
  const session = finishedSession();
  session.messages = [
    { role: "assistant", content: "控えから戻す確認をしたことはありますか？" },
    { role: "user", content: "はい、去年の春に試しました" },
  ];
  const file = buildSaveFile(session, { restore: "戻す確認をしたとの回答でした" }, "要約");
  const text = JSON.stringify(file);
  assert.equal(text.includes("控えから戻す確認をしたことはありますか"), false);
  assert.equal(text.includes("去年の春に試しました"), false);
  assert.equal(text.includes("history"), false);
  assert.deepEqual(Object.keys(file.items[0]).sort(), [
    "itemId",
    "lastYearAnswer",
    "reasons",
    "sources",
    "states",
    "summary",
    "vendorAnswer",
    "vendorQuestions",
  ]);
});

test("保存と読み込み：状態と確認事項が戻り、終わった問診として返事を検証できる", () => {
  const file = JSON.parse(JSON.stringify(buildSaveFile(finishedSession(), {}, "要約")));
  const loaded = sessionFromSaveFile(file);
  assert.ok(loaded);
  assert.equal(loaded.session.states.isolate, "denied");
  assert.equal(loaded.session.sources?.acquire, "reply");
  assert.equal(loaded.session.finished, true);
  assert.equal(loaded.session.messages.length, 0);
  assert.equal(vendorRequestFor(loaded.session)?.requirements[0].id, "q1_r1");
});

test("読み込み：確認の出どころがない前のファイルも読み込める", () => {
  const file = JSON.parse(JSON.stringify(buildSaveFile(finishedSession(), {}, "要約")));
  delete file.items[0].sources;
  const loaded = sessionFromSaveFile(file);
  assert.ok(loaded);
  assert.deepEqual(loaded.session.sources, {});
});

test("読み込み：形式、版、値が正しくないファイルを拒否する", () => {
  const good = buildSaveFile(finishedSession(), {}, "要約");
  const broken = [
    null,
    { ...good, format: "other" },
    { ...good, version: 2 },
    { ...good, items: [{ ...good.items[0], states: { ...good.items[0].states, acquire: "done" } }] },
    { ...good, items: [{ ...good.items[0], summary: "長".repeat(1001) }] },
    { ...good, items: [{ ...good.items[0], sources: { acquire: "photo" } }] },
    { ...good, items: [{ ...good.items[0], sources: { other: "reply" } }] },
    {
      ...good,
      items: [
        {
          ...good.items[0],
          vendorQuestions: [
            { ...good.items[0].vendorQuestions[0], requirements: [{ id: "x", viewpointId: "acquire", text: "t", followUp: "" }] },
          ],
        },
      ],
    },
  ];
  for (const input of broken) assert.equal(sessionFromSaveFile(input), null);
});

// e2e テスト（e2e/load-result.spec.ts）が読み込む架空の保存ファイル。スキーマを変えたときに古くならないよう、ここで照らす
test("e2e の架空の保存ファイル：今のスキーマで読み込め、e2e が照合する判定と穴になる", () => {
  const file = JSON.parse(readFileSync(new URL("../../e2e/fixtures/saved-result-v1.json", import.meta.url), "utf8"));
  assert.equal(file.version, SAVE_VERSION);
  const loaded = sessionFromSaveFile(file);
  assert.ok(loaded);
  assert.equal(loaded.session.itemId, BACKUP_ITEM.id);
  assert.equal(computeVerdict(BACKUP_ITEM, loaded.session.states), "paper_only");
  assert.deepEqual(
    computeResult(BACKUP_ITEM, loaded.session.states).holes.map((hole) => hole.viewpointId),
    ["isolate", "restore"],
  );
  assert.equal(vendorRequestFor(loaded.session)?.requirements.length, 2);
});
