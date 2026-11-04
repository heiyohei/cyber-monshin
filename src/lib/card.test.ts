import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { readFileSync } from "node:fs";
import { buildCard, STATUS_LABELS, statusLabel, vendorMessage, viewpointByScreenName } from "./card.ts";
import { initialStates } from "./verdict.ts";

test("カード：確認の出どころを観点ごとに持ち、まだ確かめていない観点には付けない", () => {
  const states = { ...initialStates(BACKUP_ITEM), acquire: "confirmed" as const, restore: "denied" as const };
  const card = buildCard(BACKUP_ITEM, states, "yes", { acquire: "reply", restore: "answer", isolate: "answer" });
  const source = Object.fromEntries(card.viewpoints.map((viewpoint) => [viewpoint.id, viewpoint.source]));
  assert.deepEqual(source, { acquire: "reply", restore: "answer", isolate: null, procedure: null });
});

test("カード：できている観点は、回答からか返事からかを同じ形で添え、「確認」と言い切らない", () => {
  assert.equal(statusLabel("confirmed", "answer"), "できている（回答から）");
  assert.equal(statusLabel("confirmed", null), "できている（回答から）");
  assert.equal(statusLabel("confirmed", "reply"), "できている（ベンダーの返事から）");
  assert.equal(statusLabel("denied", "reply"), "できていない（ベンダーの返事から）");
  assert.equal(statusLabel("denied", "answer"), "できていない");
  assert.equal(statusLabel("unknown", "answer"), "わからない");
  assert.equal(statusLabel("not_asked"), "まだ確かめていません");
  // 観点の状態の言葉に「確認」を使わない（判定の名前「はい（回答で確認）」は別で、変えていない）
  for (const status of ["not_asked", "confirmed", "denied", "unknown"] as const) {
    for (const source of ["answer", "reply", null] as const) assert.ok(!statusLabel(status, source).includes("確認"));
  }
});

test("カード：状態の言葉は Claude に渡さない（Claude を呼ぶコードに、状態の言葉も statusLabel も出てこない）", () => {
  const words = [...Object.values(STATUS_LABELS), "回答で確認", "できている（ベンダーの返事から）", "できていない（ベンダーの返事から）"];
  for (const file of ["interview.ts", "vendor-reply.ts", "read-image.ts", "term.ts", "claude.ts", "session.ts"]) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    assert.ok(!source.includes("statusLabel") && !source.includes("STATUS_LABELS"), file);
    // 「できていない」「わからない」は、ふつうの言葉として指示の中に出てくる（写真の下書きで判定の言葉を使わない、など）ので除く
    for (const word of words.filter((word) => word !== "わからない" && word !== "できていない")) assert.ok(!source.includes(`"${word}"`) && !source.includes(`「${word}」`), `${file}：${word}`);
  }
});

test("カード：判定と判定の名前は、確認の出どころに左右されない", () => {
  const states = { acquire: "confirmed", restore: "confirmed", isolate: "confirmed", procedure: "confirmed" } as const;
  const byAnswer = buildCard(BACKUP_ITEM, states, "no", { acquire: "answer", restore: "answer", isolate: "answer", procedure: "answer" });
  const byReply = buildCard(BACKUP_ITEM, states, "no", { acquire: "reply", restore: "reply", isolate: "reply", procedure: "reply" });
  assert.equal(byAnswer.verdict, "confirmed_by_answer");
  assert.equal(byReply.verdict, byAnswer.verdict);
  assert.equal(byReply.label, byAnswer.label);
});

test("質問文：聞く観点の根拠の原文を、重ねずに添える", () => {
  const card = buildCard(BACKUP_ITEM, initialStates(BACKUP_ITEM), "yes");
  const message = vendorMessage(
    {
      question: "切り離しと戻す確認について教えてください。",
      requirements: [
        { id: "q1_r1", viewpointId: "isolate", text: "切り離し", followUp: "" },
        { id: "q1_r2", viewpointId: "isolate", text: "別の控え", followUp: "" },
        { id: "q2_r1", viewpointId: "restore", text: "戻す確認", followUp: "" },
      ],
    },
    card,
  );
  const isolate = BACKUP_ITEM.viewpoints.find((viewpoint) => viewpoint.id === "isolate")!.evidence;
  assert.ok(message.startsWith("切り離しと戻す確認について教えてください。\n\n（参考）"));
  assert.ok(message.includes("厚生労働省が示したものではありません"));
  assert.ok(message.includes(`・「${isolate.text}」（${isolate.source}）`));
  assert.equal(message.split(isolate.text).length - 1, 1);
  assert.equal(message.split("\n・").length - 1, 2);
});

test("質問文：根拠がないときは、質問文をそのまま返す", () => {
  const card = buildCard(BACKUP_ITEM, initialStates(BACKUP_ITEM), "yes");
  assert.equal(vendorMessage({ question: "質問", requirements: [] }, card), "質問");
});

test("カード：観点は画面の表示名（label）で持ち、Claude に渡す観点名（name）は持たない", () => {
  const card = buildCard(BACKUP_ITEM, initialStates(BACKUP_ITEM), "yes");
  assert.deepEqual(
    card.viewpoints.map((viewpoint) => viewpoint.label),
    BACKUP_ITEM.viewpoints.map((viewpoint) => viewpoint.label),
  );
  for (const viewpoint of card.viewpoints) assert.equal("name" in viewpoint, false);
  const states = { ...initialStates(BACKUP_ITEM), isolate: "denied" as const };
  assert.deepEqual(
    buildCard(BACKUP_ITEM, states, "yes").result.holes.map((hole) => hole.label),
    [BACKUP_ITEM.viewpoints.find((viewpoint) => viewpoint.id === "isolate")?.label],
  );
});

test("画面の観点名から観点を探す：表示名でも、前の観点名でも見つかる", () => {
  for (const viewpoint of BACKUP_ITEM.viewpoints) {
    assert.equal(viewpointByScreenName(BACKUP_ITEM, `${viewpoint.label}：できている（回答から）`)?.id, viewpoint.id);
    assert.equal(viewpointByScreenName(BACKUP_ITEM, viewpoint.name)?.id, viewpoint.id);
  }
  assert.equal(viewpointByScreenName(BACKUP_ITEM, "関係のない言葉"), undefined);
});
