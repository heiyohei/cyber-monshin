import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { ITEMS } from "../data/items.ts";
import type { FocusItem } from "../data/types.ts";
import { UPDATE_ITEM } from "../data/update.ts";
import { readAllItems, readItemAnswer, readVendorAnswer, type SheetRows } from "./checklist-excel.ts";

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

test("Excel：シート名が同じでも、表の上の「事業者確認用」の表示で事業者用を見分ける", () => {
  const name = "医療機関におけるサイバーセキュリティ対策チェックリスト";
  const sheets: SheetRows[] = [
    { sheet: name, data: [["令和8年度版 医療機関・薬局におけるサイバーセキュリティ対策チェックリスト", "医療機関・薬局 確認用"], ["2", PATCH, "いいえ"]] },
    { sheet: name, data: [["令和8年度 医療機関・薬局におけるサイバーセキュリティ対策チェックリスト", "事業者確認用"], ["2", PATCH, "対象外"]] },
  ];
  assert.deepEqual(readItemAnswer(UPDATE_ITEM, sheets), { status: "read", answer: "no" });
  assert.deepEqual(readVendorAnswer(UPDATE_ITEM, sheets), { status: "read", answer: "not_applicable" });
  // 事業者用だけを読み込んでも、ベンダーの回答を去年の回答と取り違えない
  assert.deepEqual(readItemAnswer(UPDATE_ITEM, sheets.slice(1)), { status: "not_found", answer: "unknown" });
});

// 5項目をまとめて読むときの行。文面は令和8年度版をもとにした架空のもの
const ROWS = {
  devices: ["①機器の台帳管理をしている。", "②リモートメンテナンスの経路を把握している。", "⑭接続元制限をしている。"],
  update: [PATCH],
  accounts: [
    "④アクセス利用権限を設定している。",
    "⑤不要なアカウントを削除している。",
    "⑧パスワードの使い回しをしていない。",
    "⑪アプリケーションログインの認証をしている。",
    "⑫OSログインの認証をしている。",
  ],
  backup: [R8],
  continuity: ["①連絡体制図がある。", "③事業継続計画（BCP）を策定している。"],
};

function hospitalRows(answers: Record<string, (string | null)[]>): (string | null)[][] {
  return Object.entries(ROWS).flatMap(([id, texts]) => texts.map((text, i) => ["2", text, id in answers ? answers[id][i] : "はい"]));
}

test("Excel：5項目をまとめて読み、並びは ITEMS の順。気になる点は固定の3つだけ", () => {
  const sheets: SheetRows[] = [
    { sheet: "医療機関確認用", data: hospitalRows({ accounts: ["はい", "はい", "いいえ", "はい", "はい"], continuity: ["はい", null] }) },
    {
      sheet: "事業者確認用",
      data: [
        ["2", ROWS.devices[1], "はい"],
        ["2", PATCH, "対象外"],
        ["2", ROWS.accounts[0], "いいえ"],
        ["3", ROWS.continuity[1], "はい"],
      ],
    },
  ];
  const readings = readAllItems(ITEMS, sheets);
  assert.deepEqual(
    readings.map((reading) => reading.itemId),
    ITEMS.map((item) => item.id),
  );
  const byId = Object.fromEntries(readings.map((reading) => [reading.itemId, reading]));
  assert.deepEqual(byId.devices, {
    itemId: "devices",
    lastYear: { status: "read", answer: "yes" },
    vendor: { status: "read", answer: "yes" },
    concerns: [],
  });
  // ベンダーが「対象外」にした項目は病院の責任になるので、気になる点に出す
  assert.deepEqual(byId.update, {
    itemId: "update",
    lastYear: { status: "read", answer: "yes" },
    vendor: { status: "read", answer: "not_applicable" },
    concerns: ["vendor_not_applicable"],
  });
  // チェック項目が複数なら、1つでも「いいえ」なら「いいえ」
  assert.deepEqual(byId.accounts, {
    itemId: "accounts",
    lastYear: { status: "read", answer: "no" },
    vendor: { status: "read", answer: "no" },
    concerns: ["last_year_no"],
  });
  // 事業者用の項目がない対策は「項目がない」
  assert.deepEqual(byId.backup, {
    itemId: "backup",
    lastYear: { status: "read", answer: "yes" },
    vendor: { status: "no_item", answer: "no_item" },
    concerns: [],
  });
  // 回答が空の項目があれば、去年の回答は要確認で、読み取れなかったことを気になる点に出す
  assert.deepEqual(byId.continuity, {
    itemId: "continuity",
    lastYear: { status: "ambiguous", answer: "unknown" },
    vendor: { status: "read", answer: "yes" },
    concerns: ["unreadable"],
  });
});

test("Excel：事業者用のシートがなければ、ベンダーの回答は要確認。気になる点にはしない", () => {
  const readings = readAllItems(ITEMS, [{ sheet: "医療機関確認用", data: hospitalRows({}) }]);
  for (const reading of readings) {
    assert.deepEqual(reading.lastYear, { status: "read", answer: "yes" });
    assert.deepEqual(reading.concerns, []);
  }
  const byId = Object.fromEntries(readings.map((reading) => [reading.itemId, reading]));
  assert.deepEqual(byId.update.vendor, { status: "no_sheet", answer: "unknown" });
  assert.deepEqual(byId.backup.vendor, { status: "no_item", answer: "no_item" });
});

test("Excel：読み取れない項目とベンダーの対象外が重なれば、気になる点は2つ。何も読めなければ5項目とも要確認", () => {
  const rows = hospitalRows({}).filter((row) => row[1] !== PATCH);
  const sheets: SheetRows[] = [
    { sheet: "医療機関確認用", data: rows },
    { sheet: "事業者確認用", data: [["2", PATCH, "対象外"], ["2", ROWS.devices[1], null]] },
  ];
  const byId = Object.fromEntries(readAllItems(ITEMS, sheets).map((reading) => [reading.itemId, reading]));
  assert.deepEqual(byId.update.lastYear, { status: "not_found", answer: "unknown" });
  assert.deepEqual(byId.update.concerns, ["vendor_not_applicable", "unreadable"]);
  // 事業者用の行はあるが回答が空なら、ベンダーの回答が読み取れなかったとして気になる点に出す
  assert.deepEqual(byId.devices.vendor, { status: "ambiguous", answer: "unknown" });
  assert.deepEqual(byId.devices.concerns, ["unreadable"]);

  const empty = readAllItems(ITEMS, []);
  assert.equal(empty.length, 5);
  for (const reading of empty) {
    assert.deepEqual(reading.lastYear, { status: "not_found", answer: "unknown" });
    assert.deepEqual(reading.concerns, ["unreadable"]);
    assert.equal(reading.vendor.status, reading.itemId === "backup" ? "no_item" : "no_sheet");
  }
});
