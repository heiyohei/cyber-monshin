import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { buildSaveFile, sessionFromSaveFile } from "./save-file.ts";
import { createSession, vendorRequestFor } from "./session.ts";

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
