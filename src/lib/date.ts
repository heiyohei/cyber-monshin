// 保存した日時（ISO 8601、UTC）から、日本時間の日付の文字列を作る。
// 保存ファイルの名前（src/lib/save-file.ts）と、読み込んだときの画面の案内（src/app/interview-demo.tsx）で同じ関数を使う。
// 利用者は日本の病院なので、ブラウザやサーバー（Vercel は UTC）のタイムゾーンに頼らず、Asia/Tokyo を明示する。
// UTC のまま日付を切り出す（savedAt.slice(0, 10)）と、日本時間の朝9時より前に保存したものが前の日になる。
// 保存ファイルの中の savedAt は UTC のまま（保存形式の互換のため）。日付の文字列を作るときだけ日本時間にする
const TIME_ZONE = "Asia/Tokyo";

// 年月日を数で取り出すための書式。ロケールは数字の形（算用数字、西暦）を決めるためだけに使い、区切りは使わない
const TOKYO_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// 受け付ける日時の形：時差つきの ISO 8601（toISOString の形 2026-11-05T15:50:00.000Z と、+09:00 のような時差）。
// 読み込むファイルの savedAt は信頼できない入力。時差のない日時（2026-11-05T23:30）は端末の時刻として読まれて
// 日付が端末のタイムゾーンで変わるので、受け付けない
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export type TokyoDate = { year: number; month: number; day: number };

// 日本時間の年月日。日時が読めなければ null
export function tokyoDateOf(savedAt: string): TokyoDate | null {
  if (!ISO_WITH_OFFSET.test(savedAt)) return null;
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = TOKYO_DATE_FORMAT.formatToParts(date);
  const numberOf = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = numberOf("year");
  const month = numberOf("month");
  const day = numberOf("day");
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return { year, month, day };
}

// ファイルの名前に使う日付（例：2026-11-06）。日本時間。日時が読めなければ null
export function tokyoDateStringOf(savedAt: string): string | null {
  const date = tokyoDateOf(savedAt);
  if (!date) return null;
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

// 画面の案内に使う日付（例：11月6日）。日本時間。日時が読めなければ null
export function tokyoDayLabelOf(savedAt: string): string | null {
  const date = tokyoDateOf(savedAt);
  if (!date) return null;
  return `${date.month}月${date.day}日`;
}
