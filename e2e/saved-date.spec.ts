import { readFileSync } from "node:fs";
import { expect, test } from "playwright/test";
import { SAVED_RESULT_FIXTURE } from "./helpers";

// 保存ファイルの名前と、読み込んだ案内の日付は日本時間（src/lib/date.ts）。端末のタイムゾーンが UTC でも変わらないことを確かめる。
// playwright.config.ts は端末を日本時間にしているので、この組だけ UTC にする。
// 日本時間の 11/6 0:50 は UTC では 11/5 15:50。ほかの e2e の見本ファイル（11/1 18:00）は UTC でも同じ日なので、ここで境目を見る。
// Claude は呼ばない
test.use({ timezoneId: "UTC" });

const SAVED_AT = "2026-11-05T15:50:00.000Z";

test("保存ファイルの日付：端末が UTC でも、案内とファイル名は日本時間の日付になる", async ({ page }) => {
  // 読み込み：見本ファイルの写しの savedAt を日本時間の深夜（UTC では前の日）にする。見本ファイルそのものは変えない
  const fixture = JSON.parse(readFileSync(SAVED_RESULT_FIXTURE, "utf8"));
  fixture.savedAt = SAVED_AT;
  // 保存：同じ瞬間に保存したことにする（ブラウザの new Date() を固定する。サーバーの時計は変わらない）
  await page.clock.setFixedTime(new Date(SAVED_AT));
  await page.goto("/");
  await page.getByLabel("続きを再開するためのファイルを読み込む").setInputFiles({
    name: "saved-result-midnight.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture, null, 2)),
  });
  await expect(page.getByRole("heading", { name: "問診のまとめ" })).toBeVisible();

  // 案内の日付は 11/5（UTC）ではなく 11/6（日本時間）。同じ文が読み上げ用の領域にも入るので、返事の欄の中だけを見る
  await expect(
    page.locator("form").getByText("11月6日に保存した結果を読み込みました。ベンダーの返事を下に貼り付けてください。"),
  ).toBeVisible();

  // ファイル名の日付も 11/6。中の savedAt は UTC のまま
  const saveButton = page.getByRole("button", { name: "続きを再開するためのファイルを保存する", exact: true });
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton.click()]);
  expect(download.suggestedFilename()).toBe("サイバー問診_続きを再開するためのファイル_2026-11-06.json");
  const saved = JSON.parse(readFileSync(await download.path(), "utf8"));
  expect(saved.savedAt).toBe(SAVED_AT);
});
