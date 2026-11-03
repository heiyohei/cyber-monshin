import { expect, test } from "playwright/test";

// 入口の画面。Claude は呼ばない
test("入口：3つの始め方と注意書きが見える", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "病院のサイバー問診アシスタント" })).toBeVisible();

  // 始め方は3つ（サンプル、Excel、保存ファイル）
  await expect(page.getByRole("heading", { name: "サンプルで試す" })).toBeVisible();
  await expect(page.getByRole("button", { name: "サンプルで試す" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "去年のチェックリスト（Excel）から始める" })).toBeVisible();
  await expect(page.getByLabel("Excel を読み込む")).toBeAttached();
  await expect(page.getByRole("heading", { name: "保存したファイルから続ける" })).toBeVisible();
  await expect(page.getByLabel("続きを再開するためのファイルを読み込む")).toBeAttached();

  // 注意書き（保証しない、公式ではない）
  await expect(page.getByText("対策が基準を満たしていると保証するものではなく、法的な判断もしません。")).toBeVisible();
  await expect(page.getByText("厚生労働省の公式ツールではありません。")).toBeVisible();
});

test("エラー：存在しないページで日本語の 404 が出る", async ({ page }) => {
  const response = await page.goto("/sonzai-shinai-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  await expect(page.getByRole("link", { name: "最初のページへ戻る" })).toBeVisible();
});
