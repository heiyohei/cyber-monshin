import path from "node:path";
import { expect, type Page } from "playwright/test";
import { BACKUP_ITEM } from "../src/data/backup";
import { statusLabel } from "../src/lib/card";
import { computeVerdict, VERDICT_LABELS, type ViewpointStates, type ViewpointStatus } from "../src/lib/verdict";

// 架空の保存ファイル（版1、バックアップと復旧）。中身は src/lib/save-file.test.ts でスキーマと照らしている
export const SAVED_RESULT_FIXTURE = path.join(__dirname, "fixtures", "saved-result-v1.json");

// 入口から保存ファイルを読み込み、結果の画面（問診のまとめ）が出るまで待つ。Claude は呼ばない
export async function loadSavedResult(page: Page) {
  await page.goto("/");
  await page.getByLabel("続きを再開するためのファイルを読み込む").setInputFiles(SAVED_RESULT_FIXTURE);
  await expect(page.getByRole("heading", { name: "問診のまとめ" })).toBeVisible();
}

// 判定カード（右の欄）。観点の状態はここに「観点名：状態の言葉」の形で出る
export function verdictCard(page: Page) {
  return page.getByRole("complementary", { name: "判定カード" });
}

const STATUSES: ViewpointStatus[] = ["not_asked", "confirmed", "denied", "unknown"];

// 画面の状態の言葉 → 状態。言葉は src/lib/card.ts の statusLabel から作るので、文を変えてもここは古くならない。
// 同じ状態でも、ベンダーの返事で決まった観点は「できている（ベンダーの返事から）」のように言葉が変わる
const STATUS_BY_LABEL = new Map<string, ViewpointStatus>(
  STATUSES.flatMap((status) => [
    [statusLabel(status), status],
    [statusLabel(status, "reply"), status],
  ]),
);
export const STATUS_WORDS = [...STATUS_BY_LABEL.keys()];

// 判定カードの4つの観点から状態を読み取り、判定の言葉が、コードの計算（computeVerdict）と一致することを確かめる。
// Claude は観点の状態を報告するだけで、判定は決めない（CLAUDE.md の決定事項）。サンプルも架空の保存ファイルも、去年の回答は「はい」
export async function expectVerdictComputedFromCard(page: Page): Promise<ViewpointStates> {
  const card = verdictCard(page);
  const states: ViewpointStates = {};
  for (const viewpoint of BACKUP_ITEM.viewpoints) {
    const line = await card.getByText(new RegExp(`^${viewpoint.name}：`)).textContent();
    const label = (line ?? "").slice(viewpoint.name.length + 1);
    const status = STATUS_BY_LABEL.get(label);
    expect(status, `${viewpoint.name}の状態の言葉「${label}」は決まった言葉ではありません`).toBeDefined();
    states[viewpoint.id] = status!;
  }
  const verdict = computeVerdict(BACKUP_ITEM, states);
  const expected = verdict === "reviewing" ? "去年の回答：はい" : VERDICT_LABELS[verdict];
  await expect(card.getByText(expected, { exact: true })).toBeVisible();
  return states;
}
