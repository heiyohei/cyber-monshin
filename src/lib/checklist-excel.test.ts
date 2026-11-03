import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import type { FocusItem } from "../data/types.ts";
import { UPDATE_ITEM } from "../data/update.ts";
import { readItemAnswer, readVendorAnswer, type SheetRows } from "./checklist-excel.ts";

const R8 = "②インシデント発生時に診療を継続するために必要な情報を検討し、バックアップを確保のうえ、復旧手順を確認している。";
const R7 = "インシデント発生時に診療を継続するために必要な情報を検討し、データやシステムのバックアップの実施と復旧手順を確認している。(3-②)";
const PATCH = "⑥セキュリティパッチ（最新ファームウェアや更新プログラム）を適用している。";

function sheet(...rows: (string | null)[][]): SheetRows[] {
  return [{ sheet: "医療機関確認用", data: rows }];
}

test("Excel：3-② の行から回答を読む（令和8年度版と令和7年度版の文面）", () => {
  assert.deepEqual(readItemAnswer(BACKUP_ITEM, sheet(["3", R8, "はい", null])), { status: "read", answer: "yes" });
  assert.deepEqual(readItemAnswer(BACKUP_ITEM, sheet(["3", R7, null, "いいえ"])), { status: "read", answer: "no" });
});

test("Excel：ほかの項目の回答は使わない", () => {
  const rows = sheet(["2", "②アカウントの管理をしている。", "いいえ"], ["3", R8, "はい"]);
  assert.deepEqual(readItemAnswer(BACKUP_ITEM, rows), { status: "read", answer: "yes" });
});

test("Excel：全角や空白が混ざっていても読む", () => {
  assert.deepEqual(readItemAnswer(BACKUP_ITEM, sheet(["バックアップ を確保のうえ、復旧 手順を確認", " はい "])), {
    status: "read",
    answer: "yes",
  });
});

test("Excel：回答が空なら要確認、項目が見つからなければ要確認", () => {
  assert.deepEqual(readItemAnswer(BACKUP_ITEM, sheet(["3", R8, null])), { status: "ambiguous", answer: "unknown" });
  assert.deepEqual(readItemAnswer(BACKUP_ITEM, sheet(["1", "体制を整備している", "はい"])), {
    status: "not_found",
    answer: "unknown",
  });
  assert.deepEqual(readItemAnswer(BACKUP_ITEM, []), { status: "not_found", answer: "unknown" });
});

test("Excel：はいといいえが両方あれば要確認にする", () => {
  assert.deepEqual(readItemAnswer(BACKUP_ITEM, sheet(["3", R8, "はい", "いいえ"])), {
    status: "ambiguous",
    answer: "unknown",
  });
});

test("Excel：医療機関用のシートと事業者用のシートを分けて読む", () => {
  const sheets: SheetRows[] = [
    { sheet: "医療機関確認用", data: [["2", PATCH, "はい"]] },
    { sheet: "事業者確認用", data: [["2", PATCH, "対象外"]] },
  ];
  assert.deepEqual(readItemAnswer(UPDATE_ITEM, sheets), { status: "read", answer: "yes" });
  assert.deepEqual(readVendorAnswer(UPDATE_ITEM, sheets), { status: "read", answer: "not_applicable" });
  assert.equal(readVendorAnswer(UPDATE_ITEM, sheets.slice(0, 1)), null);
  assert.equal(readVendorAnswer(BACKUP_ITEM, sheets), null);
});

test("Excel：チェック項目が複数なら、1つでもいいえならいいえ、すべてはいのときだけはい", () => {
  const twoItems = {
    ...BACKUP_ITEM,
    checkItems: [
      { no: "3-①", text: "連絡体制図", keywords: ["連絡体制図"] },
      { no: "3-③", text: "BCP", keywords: ["事業継続計画"] },
    ],
  } as FocusItem;
  const rows = (first: string | null, second: string | null) =>
    sheet(["3", "①連絡体制図がある。", first], ["3", "③事業継続計画（BCP）を策定している。", second]);
  assert.deepEqual(readItemAnswer(twoItems, rows("はい", "いいえ")), { status: "read", answer: "no" });
  assert.deepEqual(readItemAnswer(twoItems, rows("はい", "はい")), { status: "read", answer: "yes" });
  assert.deepEqual(readItemAnswer(twoItems, rows("はい", null)), { status: "ambiguous", answer: "unknown" });
});
