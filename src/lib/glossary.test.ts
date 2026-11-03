import assert from "node:assert/strict";
import { test } from "node:test";
import { ITEMS } from "../data/items.ts";
import { splitByTerms, type TextPart } from "./glossary.ts";

// 読みやすいように、区切りを「用語」か「文字」の短い形にする
function shape(parts: TextPart[]): string[] {
  return parts.map((part) => (part.type === "term" ? `[${part.text}→${part.entry.term}]` : part.text));
}

test("用語の区切り：長い用語を優先し、その中の短い用語には印を付けない", () => {
  assert.deepEqual(shape(splitByTerms("管理者権限を持つ人")), ["[管理者権限→管理者権限]", "を持つ人"]);
  assert.deepEqual(shape(splitByTerms("復旧手順を確認している")), ["[復旧手順→復旧手順]", "を確認している"]);
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
  assert.deepEqual(shape(splitByTerms("IDとパスワード")), ["[ID→アカウント]", "とパスワード"]);
  assert.deepEqual(shape(splitByTerms("VIDEOを見る")), ["VIDEOを見る"]);
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
