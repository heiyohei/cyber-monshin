import assert from "node:assert/strict";
import { test } from "node:test";
import { GLOSSARY } from "./terms.ts";

// 件数は20〜40件。増やしすぎると画面がうるさくなる
test("用語の説明：20〜40件で、空の用語や説明がない", () => {
  assert.ok(GLOSSARY.length >= 20 && GLOSSARY.length <= 40, `${GLOSSARY.length}件`);
  for (const entry of GLOSSARY) {
    assert.ok(entry.term.trim() === entry.term && entry.term.length > 0, `用語が空か、前後に空白がある：${entry.term}`);
    assert.ok(entry.short.trim().length > 0, `説明が空：${entry.term}`);
    assert.ok(entry.short.endsWith("。"), `説明が「。」で終わっていない：${entry.term}`);
    for (const alias of entry.aliases ?? []) {
      assert.ok(alias.trim() === alias && alias.length > 0, `別の書き方が空か、前後に空白がある：${entry.term}`);
    }
  }
});

test("用語の説明：用語と別の書き方が重複していない", () => {
  const words = GLOSSARY.flatMap((entry) => [entry.term, ...(entry.aliases ?? [])]);
  const duplicates = words.filter((word, index) => words.indexOf(word) !== index);
  assert.deepEqual(duplicates, []);
});

// 準拠の保証をせず、画面では「お金がかかる／かからない」のような言い方をしない（CLAUDE.md、SPEC 第8章）
test("用語の説明：「保証」「お金」「費用」を使っていない", () => {
  for (const entry of GLOSSARY) {
    for (const word of ["保証", "お金", "費用"]) {
      assert.ok(!entry.short.includes(word), `${entry.term}の説明に「${word}」がある`);
    }
  }
});
