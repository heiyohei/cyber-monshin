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

// 厚生労働省の様式は、医療機関用も事業者用もシート名が同じ。表の上にある「事業者確認用」の表示でも見分ける
function isVendorSheet({ sheet, data }: SheetRows): boolean {
  if (sheet.normalize("NFKC").includes("事業者")) return true;
  return data.slice(0, 6).some((row) => row.map(text).join("").includes("事業者確認用"));
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
  const rows = sheets.filter((sheet) => !isVendorSheet(sheet)).flatMap(({ data }) => data);
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
  const rows = sheets.filter((sheet) => isVendorSheet(sheet)).flatMap(({ data }) => data);
  if (rows.length === 0) return null;
  return readCheckItem(rows, item.vendorCheckItem);
}

// ベンダーの回答の読み取り。事業者用の項目がない（項目がない）と、事業者用のシートを読み込んでいない（要確認）も区別する
export type VendorReading =
  | ExcelReading<VendorAnswer>
  | { status: "no_item"; answer: "no_item" }
  | { status: "no_sheet"; answer: "unknown" };

// 気になる点。画面には固定の短い文（CONCERN_TEXTS）を出す
export type Concern = "last_year_no" | "vendor_not_applicable" | "unreadable";

export const CONCERN_TEXTS: Record<Concern, string> = {
  last_year_no: "去年は「いいえ」でした",
  vendor_not_applicable: "ベンダーが対象外にしています。病院が受け持つ項目です",
  unreadable: "読み取れませんでした。選び直してください",
};

export type ItemReading = {
  itemId: string;
  lastYear: ExcelReading;
  vendor: VendorReading;
  concerns: readonly Concern[];
};

function readVendor(item: FocusItem, sheets: SheetRows[]): VendorReading {
  if (!item.vendorCheckItem) return { status: "no_item", answer: "no_item" };
  return readVendorAnswer(item, sheets) ?? { status: "no_sheet", answer: "unknown" };
}

// 去年が「いいえ」、ベンダーが「対象外」（病院の責任になる）、読み取れなかった、の3つだけ。該当がなければ空
function concernsOf(lastYear: ExcelReading, vendor: VendorReading): Concern[] {
  const concerns: Concern[] = [];
  if (lastYear.answer === "no") concerns.push("last_year_no");
  if (vendor.answer === "not_applicable") concerns.push("vendor_not_applicable");
  if (lastYear.status !== "read" || vendor.status === "ambiguous" || vendor.status === "not_found") {
    concerns.push("unreadable");
  }
  return concerns;
}

// 重点項目のすべてについて、去年の回答（医療機関用）と、事業者用のシートがあればベンダーの回答を読む。
// 並びは渡した items のまま。Excel はブラウザの中で読み、この結果もサーバーへは送らない
export function readAllItems(items: readonly FocusItem[], sheets: SheetRows[]): ItemReading[] {
  return items.map((item) => {
    const lastYear = readItemAnswer(item, sheets);
    const vendor = readVendor(item, sheets);
    return { itemId: item.id, lastYear, vendor, concerns: concernsOf(lastYear, vendor) };
  });
}
