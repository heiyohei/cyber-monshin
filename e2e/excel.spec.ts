import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "playwright/test";

// 厚生労働省の様式は git に入れない。手元の samples/（または E2E_SAMPLES_DIR）に
// 架空の記入例の .xlsx があるときだけ動かし、なければ飛ばす
const samplesDir = process.env.E2E_SAMPLES_DIR ?? path.resolve("samples");
const xlsxFiles = existsSync(samplesDir) ? readdirSync(samplesDir).filter((name) => name.endsWith(".xlsx")) : [];
const hospitalFile = xlsxFiles.find((name) => name.includes("医療機関"));

test("Excel の読み込み：去年の回答をブラウザの中で読み取り、サーバーへは送らない", async ({ page }) => {
  test.skip(!hospitalFile, `医療機関用の .xlsx が ${samplesDir} にないので飛ばします`);

  await page.goto("/");
  // Excel はブラウザの中で読む決まりなので、読み込みの間にサーバーへ送る要求がないことも確かめる
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });

  await page.getByLabel("Excel を読み込む").setInputFiles(path.join(samplesDir, hospitalFile!));

  // 既定の対策はバックアップと復旧（チェック項目 3-②）
  await expect(page.getByText("3-② の去年の回答を読み取りました。違っていれば選び直してください。")).toBeVisible();
  await expect(page.getByLabel("3-② の去年の回答")).toHaveValue(/^(yes|no)$/);
  await expect(page.getByRole("button", { name: "この回答で問診を始める" })).toBeVisible();
  expect(posts).toEqual([]);
});
