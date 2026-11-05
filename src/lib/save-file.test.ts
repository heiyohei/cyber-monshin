import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { computeResult } from "./result.ts";
import { buildSaveFile, SAVE_VERSION, saveFileNameOf, sessionFromSaveFile } from "./save-file.ts";
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
  assert.equal(file.version, 2);
  assert.equal(JSON.stringify(file).includes("会話の履歴"), false);
  assert.equal(file.items[0].reasons.restore, "わからないとの回答");
});

// 画面の「これまでの質問と回答」はブラウザの中だけで持つ。保存ファイルには、質問の文も回答の文も入らない
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
    "done",
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

// 版2：次にすることの「やった」印は、固定データの次の一手の ID で入る。書き出して読み込むと印が戻る
test("保存と読み込み（版2）：「やった」印が固定データの ID で入り、読み込むと戻る", () => {
  const session = finishedSession();
  const built = buildSaveFile(session, {}, "要約", [
    "backup.restore.vendor",
    "backup.isolate.free",
    "backup.isolate.free", // 重複は1つにする
    "update.apply.free", // ほかの項目の ID は落とす
    "backup.unknown.free", // 知らない ID は落とす
  ]);
  assert.equal(built.version, 2);
  // 固定データの順（観点の順 × 分類の順）で入る
  assert.deepEqual(built.items[0].done, ["backup.restore.vendor", "backup.isolate.free"]);
  assert.equal(JSON.stringify(built).includes("会話の履歴"), false);

  const loaded = sessionFromSaveFile(JSON.parse(JSON.stringify(built)));
  assert.ok(loaded);
  assert.deepEqual(loaded.done, ["backup.restore.vendor", "backup.isolate.free"]);
  // 印は問診の状態（署名つきでサーバーへ送るもの）には入れない
  assert.equal("done" in loaded.session, false);
  assert.equal(loaded.session.states.isolate, "denied");
  assert.equal(vendorRequestFor(loaded.session)?.requirements[0].id, "q1_r1");
});

test("保存：印がなければ done は空の配列", () => {
  const file = buildSaveFile(finishedSession(), {}, "要約");
  assert.deepEqual(file.items[0].done, []);
});

// ファイルの名前の日付は日本時間。中の savedAt は UTC のまま（日本時間の 11/6 0:50 は UTC では 11/5 15:50）
test("保存：ファイルの名前の日付は日本時間で、中の savedAt は UTC のまま", () => {
  const file = buildSaveFile(finishedSession(), {}, "要約");
  assert.match(file.savedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(saveFileNameOf(file), /^サイバー問診_続きを再開するためのファイル_\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(
    saveFileNameOf({ savedAt: "2026-11-05T15:50:00.000Z" }),
    "サイバー問診_続きを再開するためのファイル_2026-11-06.json",
  );
  assert.equal(
    saveFileNameOf({ savedAt: "2026-11-05T14:59:59.000Z" }),
    "サイバー問診_続きを再開するためのファイル_2026-11-05.json",
  );
  // 日付が読めなければ日付を付けない（buildSaveFile が作るものでは起きない）
  assert.equal(saveFileNameOf({ savedAt: "" }), "サイバー問診_続きを再開するためのファイル.json");
});

// 版1（印の仕組みの前に保存したファイル）は今までどおり読み込め、印は空として扱う
test("読み込み（版1）：前の版のファイルも読み込め、「やった」印は空になる", () => {
  const file = JSON.parse(JSON.stringify(buildSaveFile(finishedSession(), {}, "要約", ["backup.isolate.free"])));
  file.version = 1;
  delete file.items[0].done;
  const loaded = sessionFromSaveFile(file);
  assert.ok(loaded);
  assert.deepEqual(loaded.done, []);
  assert.equal(loaded.file.version, 1);
  assert.equal(loaded.session.states.isolate, "denied");
});

test("読み込み：版3、版1に印があるもの、印の形や ID が正しくないものを拒否する", () => {
  const good = JSON.parse(JSON.stringify(buildSaveFile(finishedSession(), {}, "要約", ["backup.isolate.free"])));
  const withDone = (done: unknown) => ({ ...good, items: [{ ...good.items[0], done }] });
  const broken = [
    { ...good, version: 3 },
    { ...good, version: "2" },
    { ...good, version: 1 }, // 版1なのに done がある
    withDone("backup.isolate.free"), // 配列でない
    withDone(["update.apply.free"]), // ほかの項目の ID
    withDone(["backup.isolate.free", "backup.nothing.free"]), // 知らない ID
    withDone([1]),
    withDone(["長".repeat(81)]),
    withDone(Array.from({ length: 61 }, () => "backup.isolate.free")),
  ];
  for (const input of broken) assert.equal(sessionFromSaveFile(input), null, JSON.stringify(input).slice(0, 80));
});

// 返事の中の AI への指示のように読める文の報告は、画面で知らせるだけ。保存ファイルには、報告も引用の文も入らない
test("保存：返事の中の指示のような文の報告は入らない", () => {
  const session = finishedSession();
  session.sources = { ...session.sources, restore: "reply" };
  const file = buildSaveFile(session, { restore: "戻す試験はしていないとの返事でした" }, "要約");
  const text = JSON.stringify(file);
  // 版2（「やった」印の done が入る）になっても、報告の項目は増えない
  assert.equal(file.version, SAVE_VERSION);
  assert.equal(text.includes("suspicious"), false);
  assert.equal(text.includes("AIへの指示"), false);
  assert.deepEqual(Object.keys(file.items[0]).sort(), [
    "done",
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
    { ...good, version: 3 },
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

// e2e テスト（e2e/load-result.spec.ts、e2e/handover.spec.ts）が読み込む架空の保存ファイル。
// 版1のまま置いておき、前の版が今のスキーマで読み込めることをここで照らす（版を上げても、このファイルは変えない）
test("e2e の架空の保存ファイル（版1）：今のスキーマで読み込め、e2e が照合する判定と穴になる", () => {
  const file = JSON.parse(readFileSync(new URL("../../e2e/fixtures/saved-result-v1.json", import.meta.url), "utf8"));
  assert.equal(file.version, 1);
  assert.ok(SAVE_VERSION > 1);
  const loaded = sessionFromSaveFile(file);
  assert.ok(loaded);
  assert.deepEqual(loaded.done, []);
  assert.equal(loaded.session.itemId, BACKUP_ITEM.id);
  assert.equal(computeVerdict(BACKUP_ITEM, loaded.session.states), "paper_only");
  assert.deepEqual(
    computeResult(BACKUP_ITEM, loaded.session.states).holes.map((hole) => hole.viewpointId),
    ["isolate", "restore"],
  );
  assert.equal(vendorRequestFor(loaded.session)?.requirements.length, 2);
});
