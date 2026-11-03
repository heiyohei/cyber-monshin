import type { CheckItem, FocusItem } from "../data/types.ts";
import type { LastYearAnswer, VendorAnswer } from "./session.ts";

type Cell = unknown;
export type SheetRows = { sheet: string; data: readonly (readonly Cell[])[] };

export type ExcelReading<T extends string = LastYearAnswer> =
  | { status: "read"; answer: T }
  | { status: "ambiguous" | "not_found"; answer: "unknown" };

const ANSWERS: Record<string, VendorAnswer> = { はい: "yes", いいえ: "no", 対象外: "not_applicable" };

function text(cell: Cell): string {
  return typeof cell === "string" ? cell.normalize("NFKC").replace(/\s/g, "") : "";
}

function isVendorSheet(sheet: string): boolean {
  return sheet.normalize("NFKC").includes("事業者");
}

// 1つのチェック項目の回答を探す。文面が版で少し違うので、言葉で行を探す
function readCheckItem(rows: readonly (readonly Cell[])[], checkItem: CheckItem): ExcelReading<VendorAnswer> {
  const found = new Set<VendorAnswer>();
  let matched = false;
  for (const row of rows) {
    const joined = row.map(text).join("");
    if (!checkItem.keywords.every((keyword) => joined.includes(keyword))) continue;
    matched = true;
    for (const cell of row) {
      const answer = ANSWERS[text(cell)];
      if (answer) found.add(answer);
    }
  }
  if (found.size === 1) return { status: "read", answer: [...found][0] };
  return { status: matched ? "ambiguous" : "not_found", answer: "unknown" };
}

// 医療機関用のチェックリストから、重点項目の去年の回答を読む。
// チェック項目が複数あれば、1つでも「いいえ」なら「いいえ」、すべて「はい」のときだけ「はい」。
// 読み取れない、または答えが1つに決まらないときは「要確認」にして、画面で選び直してもらう
export function readItemAnswer(item: FocusItem, sheets: SheetRows[]): ExcelReading {
  const rows = sheets.filter(({ sheet }) => !isVendorSheet(sheet)).flatMap(({ data }) => data);
  const readings = item.checkItems.map((checkItem) => readCheckItem(rows, checkItem));

  if (readings.some((reading) => reading.answer === "no")) return { status: "read", answer: "no" };
  if (readings.every((reading) => reading.status === "read" && reading.answer === "yes")) {
    return { status: "read", answer: "yes" };
  }
  if (readings.every((reading) => reading.status === "not_found")) return { status: "not_found", answer: "unknown" };
  return { status: "ambiguous", answer: "unknown" };
}

// 事業者用のシートがあれば、対応する項目の回答（はい／いいえ／対象外）を読む
export function readVendorAnswer(item: FocusItem, sheets: SheetRows[]): ExcelReading<VendorAnswer> | null {
  if (!item.vendorCheckItem) return null;
  const rows = sheets.filter(({ sheet }) => isVendorSheet(sheet)).flatMap(({ data }) => data);
  if (rows.length === 0) return null;
  return readCheckItem(rows, item.vendorCheckItem);
}
