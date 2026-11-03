#!/usr/bin/env node
// 公開リポジトリへ入れてはいけないものを、コミットの前に止める。
// 使い方：
//   node scripts/check-public-safety.mjs          ステージ済みの変更を調べる
//   node scripts/check-public-safety.mjs --claude Claude Code の PreToolUse フックとして動く
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{8,}/, "Anthropic の API キー"],
  [/\bgh[opsu]_[A-Za-z0-9]{20,}/, "GitHub のトークン"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS のアクセスキー"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "秘密鍵"],
];
const BLOCKED_PATHS = [
  [/(^|\/)\.env($|\.(?!example$))/, "環境変数のファイル"],
  [/\.pdf$/i, "PDF（資料の原本は入れない）"],
  [/\.xlsx?$/i, "Excel（配布された様式の原本は入れない）"],
];
const BLOCKLIST = ".local/blocklist.txt";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function loadBlockedWords() {
  if (!existsSync(BLOCKLIST)) return [];
  return readFileSync(BLOCKLIST, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function findProblems() {
  const problems = [];
  const files = git("diff", "--cached", "--name-only", "--diff-filter=ACMR")
    .split("\n")
    .filter(Boolean);

  for (const file of files) {
    for (const [pattern, label] of BLOCKED_PATHS) {
      if (pattern.test(file)) problems.push(`${file}：${label}`);
    }
  }

  const words = loadBlockedWords();
  const added = git("diff", "--cached", "--unified=0", "--no-color")
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"));

  // 見つけた値そのものは表示しない
  added.forEach((line, index) => {
    for (const [pattern, label] of SECRET_PATTERNS) {
      if (pattern.test(line)) problems.push(`追加行 ${index + 1}：${label}の形式`);
    }
    if (words.some((word) => line.includes(word))) {
      problems.push(`追加行 ${index + 1}：公開しない名前（${BLOCKLIST}）`);
    }
  });
  return problems;
}

function report(problems) {
  console.error("公開リポジトリに入れられない内容が見つかりました。");
  for (const problem of problems) console.error(`- ${problem}`);
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

if (process.argv.includes("--claude")) {
  const input = JSON.parse((await readStdin()) || "{}");
  const command = input.tool_input?.command ?? "";
  if (!/\bgit\b[^;&|]*\bcommit\b/.test(command)) process.exit(0);
  const problems = findProblems();
  if (problems.length > 0) {
    report(problems);
    process.exit(2); // Claude Code は終了コード 2 でツールの実行を止める
  }
  process.exit(0);
}

const problems = findProblems();
if (problems.length > 0) {
  report(problems);
  process.exit(1);
}
console.log("公開前の確認：問題なし");
