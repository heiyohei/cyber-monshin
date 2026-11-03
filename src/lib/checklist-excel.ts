import type { LastYearAnswer } from "./session.ts";

type Cell = unknown;
export type SheetRows = { sheet: string; data: readonly (readonly Cell[])[] };

export type ExcelReading =
  | { status: "read"; answer: LastYearAnswer }
  | { status: "ambiguous" | "not_found"; answer: "unknown" };

const ANSWERS: Record<string, LastYearAnswer> = { はい: "yes", いいえ: "no" };

function text(cell: Cell): string {
  return typeof cell === "string" ? cell.normalize("NFKC").replace(/\s/g, "") : "";
}

// 3-② の行は「バックアップ」と「復旧手順」を含む。版によって文面が少し違うので、言葉で探す
function isBackupRow(row: readonly Cell[]): boolean {
  const joined = row.map(text).join("");
  return joined.includes("バックアップ") && joined.includes("復旧手順");
}

// 医療機関用チェックリストから 3-② の回答だけを取り出す。
// 読み取れない、または答えが1つに決まらないときは「要確認」にして、画面で選び直してもらう
export function readBackupAnswer(sheets: SheetRows[]): ExcelReading {
  const found = new Set<LastYearAnswer>();
  let matched = false;

  for (const { data } of sheets) {
    for (const row of data) {
      if (!isBackupRow(row)) continue;
      matched = true;
      for (const cell of row) {
        const answer = ANSWERS[text(cell)];
        if (answer) found.add(answer);
      }
    }
  }

  if (found.size === 1) return { status: "read", answer: [...found][0] };
  if (found.size > 1) return { status: "ambiguous", answer: "unknown" };
  return { status: matched ? "ambiguous" : "not_found", answer: "unknown" };
}
