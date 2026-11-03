import assert from "node:assert/strict";
import { test } from "node:test";
import { readBackupAnswer, type SheetRows } from "./checklist-excel.ts";

const R8 = "②インシデント発生時に診療を継続するために必要な情報を検討し、バックアップを確保のうえ、復旧手順を確認している。";
const R7 = "インシデント発生時に診療を継続するために必要な情報を検討し、データやシステムのバックアップの実施と復旧手順を確認している。(3-②)";

function sheet(...rows: (string | null)[][]): SheetRows[] {
  return [{ sheet: "医療機関確認用", data: rows }];
}

test("Excel：3-② の行から回答を読む（令和8年度版と令和7年度版の文面）", () => {
  assert.deepEqual(readBackupAnswer(sheet(["3", R8, "はい", null])), { status: "read", answer: "yes" });
  assert.deepEqual(readBackupAnswer(sheet(["3", R7, null, "いいえ"])), { status: "read", answer: "no" });
});

test("Excel：ほかの項目の回答は使わない", () => {
  const rows = sheet(["2", "②アカウントの管理をしている。", "いいえ"], ["3", R8, "はい"]);
  assert.deepEqual(readBackupAnswer(rows), { status: "read", answer: "yes" });
});

test("Excel：全角や空白が混ざっていても読む", () => {
  assert.deepEqual(readBackupAnswer(sheet(["バックアップ を確保のうえ、復旧 手順を確認", " はい "])), {
    status: "read",
    answer: "yes",
  });
});

test("Excel：回答が空なら要確認、項目が見つからなければ要確認", () => {
  assert.deepEqual(readBackupAnswer(sheet(["3", R8, null])), { status: "ambiguous", answer: "unknown" });
  assert.deepEqual(readBackupAnswer(sheet(["1", "体制を整備している", "はい"])), {
    status: "not_found",
    answer: "unknown",
  });
  assert.deepEqual(readBackupAnswer([]), { status: "not_found", answer: "unknown" });
});

test("Excel：はいといいえが両方あれば要確認にする", () => {
  assert.deepEqual(readBackupAnswer(sheet(["3", R8, "はい", "いいえ"])), { status: "ambiguous", answer: "unknown" });
});
