import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { ITEMS } from "../data/items.ts";
import { buildCard, vendorMessage } from "./card.ts";
import { splitByTerms, type TextPart } from "./glossary.ts";

// 読みやすいように、区切りを「用語」か「文字」の短い形にする
function shape(parts: TextPart[]): string[] {
  return parts.map((part) => (part.type === "term" ? `[${part.text}→${part.entry.term}]` : part.text));
}

test("用語の区切り：長い用語を優先し、その中の短い用語には印を付けない", () => {
  assert.deepEqual(shape(splitByTerms("管理者権限を持つ人")), ["[管理者権限→管理者権限]", "を持つ人"]);
  assert.deepEqual(shape(splitByTerms("復旧手順を確認している")), ["[復旧手順→復旧手順]", "を確認している"]);
  assert.deepEqual(shape(splitByTerms("ネットワーク機器の台帳管理を行っている。")), [
    "[ネットワーク機器→ネットワーク機器]",
    "の",
    "[台帳管理→台帳管理]",
    "を行っている。",
  ]);
});

test("用語の区切り：同じ用語は最初の1回だけ印を付け、2回目はその中の短い用語にも付けない", () => {
  assert.deepEqual(shape(splitByTerms("バックアップを取り、バックアップを戻す")), [
    "[バックアップ→バックアップ]",
    "を取り、バックアップを戻す",
  ]);
  // 2回目の「管理者権限」の中の「権限」にも印を付けない
  assert.deepEqual(shape(splitByTerms("管理者権限と管理者権限")), ["[管理者権限→管理者権限]", "と管理者権限"]);
});

test("用語の区切り：別の書き方にも当て、同じ用語として数える", () => {
  assert.deepEqual(shape(splitByTerms("事業継続計画（BCP）を策定している")), [
    "[事業継続計画→BCP]",
    "（BCP）を策定している",
  ]);
  assert.deepEqual(shape(splitByTerms("セキュリティパッチ（最新ファームウェアや更新プログラム）を適用している。")), [
    "[セキュリティパッチ→更新プログラム]",
    "（最新",
    "[ファームウェア→ファームウェア]",
    "や更新プログラム）を適用している。",
  ]);
});

test("用語の区切り：別の用語どうしは重ならずに並ぶ", () => {
  assert.deepEqual(shape(splitByTerms("アクセス利用権限を設定している。※管理者権限対象者の明確化を行っている")), [
    "[アクセス利用権限→権限]",
    "を設定している。※",
    "[管理者権限→管理者権限]",
    "対象者の明確化を行っている",
  ]);
});

test("用語の区切り：英数字の用語は英単語の一部に当てない", () => {
  assert.deepEqual(shape(splitByTerms("EOS の対象となった機器")), ["[EOS→サポート終了]", " の対象となった機器"]);
  assert.deepEqual(shape(splitByTerms("VIDEOSを見る")), ["VIDEOSを見る"]);
  assert.deepEqual(shape(splitByTerms("VPN 装置等の脆弱性")), ["[VPN→VPN]", " 装置等の", "[脆弱性→脆弱性]"]);
});

test("用語の区切り：用語がない文と空の文", () => {
  assert.deepEqual(splitByTerms("誰が何をすれば戻せるかが、手順として決まっている"), [
    { type: "text", text: "誰が何をすれば戻せるかが、手順として決まっている" },
  ]);
  assert.deepEqual(splitByTerms(""), []);
});

// 画面に出す固定データ（チェック項目の文、根拠の原文、確かめたいこと）は、区切ってつなげると元の文に戻る（原文を変えない）
test("用語の区切り：固定データの文は、つなげると元の文に戻る", () => {
  const texts = ITEMS.flatMap((item) => [
    ...item.checkItems.map((checkItem) => checkItem.text),
    item.defaultEvidence.text,
    ...item.viewpoints.flatMap((viewpoint) => [viewpoint.goal, viewpoint.evidence.text]),
    item.firstQuestion.text,
    item.firstQuestion.why,
  ]);
  assert.ok(texts.length > 0);
  for (const text of texts) {
    const parts = splitByTerms(text);
    assert.equal(parts.map((part) => part.text).join(""), text);
    // 同じ用語に2回印を付けていない
    const terms = parts.filter((part) => part.type === "term").map((part) => part.entry.term);
    assert.equal(new Set(terms).size, terms.length, text);
  }
});

function markedTerms(text: string): string[] {
  return splitByTerms(text).flatMap((part) => (part.type === "term" ? [part.entry.term] : []));
}

// ベンダーへの質問文（Claude が作った質問と、コードが添える根拠の原文の引用）にも、同じ印を付ける。
// 画面は行ごとに区切るので、行ごとにつなげると元の文に戻り、引用の中の用語（BCP、記録媒体など）にも印が付く
test("用語の区切り：ベンダーへの質問文の行は、つなげると元の文に戻り、引用の中の用語にも印が付く", () => {
  const states = { acquire: "confirmed", restore: "unknown", isolate: "denied", procedure: "unknown" } as const;
  const card = buildCard(BACKUP_ITEM, states, "yes");
  const request = {
    question: "バックアップについて、次の点を、はい／いいえで教えてください。\n1. オフライン媒体に控えを保管していますか。",
    requirements: [
      { id: "q1_r1", viewpointId: "isolate", text: "切り離して保管している", followUp: "" },
      { id: "q1_r2", viewpointId: "procedure", text: "戻す手順がある", followUp: "" },
    ],
  };
  const lines = vendorMessage(request, card).split("\n");
  for (const line of lines) assert.equal(splitByTerms(line).map((part) => part.text).join(""), line);
  const marked = lines.flatMap(markedTerms);
  for (const term of ["オフライン媒体", "記録媒体", "BCP"]) assert.ok(marked.includes(term), `${term} に印がない`);
});

// 足した用語が、固定データの根拠の原文で当たる（別の短い用語に負けない）
test("用語の区切り：根拠の原文の中の、足した用語に印が付く", () => {
  const marked = new Set(ITEMS.flatMap((item) => item.viewpoints.flatMap((viewpoint) => markedTerms(viewpoint.evidence.text))));
  for (const term of ["記録媒体", "MAC アドレス", "電子証明書", "責任分界", "パターンファイル", "運用管理規程"]) {
    assert.ok(marked.has(term), `${term} に印がない`);
  }
});
