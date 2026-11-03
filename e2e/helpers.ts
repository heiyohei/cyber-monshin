import path from "node:path";
import { expect, type Page } from "playwright/test";

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
