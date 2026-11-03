import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "playwright/test";
import { loadSavedResult, saveScreenshot } from "./helpers";

// 担当の引き継ぎ：次にすることの「やった」印と、説明用の1枚の「引き継ぐこと」。Claude は呼ばない。
// 架空の保存ファイル（版1）は、切り離し（できていない）と戻す確認（わからない）の2つが穴なので、次にすることは 2×3 = 6件。
// 照合する文は src/data/backup.ts の固定データと、e2e/fixtures/saved-result-v1.json の値
const RESULTS_DIR = path.join(__dirname, "results");
const HOLES_REGION = "診療が止まるおそれがあるところと次にすること";
// A4（297mm）から上下の余白（15mm ずつ、src/app/globals.css の @page）を引いた高さ。96dpi で 267mm ≈ 1009px
const PRINTABLE_HEIGHT_PX = (267 / 25.4) * 96;
// A4 の幅（210mm）から左右の余白を引いた幅。1枚に収まるかは、この幅で測る
const PRINTABLE_WIDTH_PX = Math.round((180 / 25.4) * 96);

test("引き継ぎ：「やった」印が保存ファイル（版2）に入り、読み込み直すと戻り、1枚の「引き継ぐこと」に出る", async ({ page }) => {
  await loadSavedResult(page);
  const holes = page.getByRole("region", { name: HOLES_REGION });
  await expect(holes.getByText("残っていること 6件（全部で6件）")).toBeVisible();
  await expect(holes.getByRole("checkbox")).toHaveCount(6);
  // 保存ファイルを読み込んだ直後は、保存し直しの案内は出ない
  await expect(holes.getByText(/「やった」の印を残すには/)).toHaveCount(0);

  // 読み上げ名は「やった」と、その項目の文。2つに印を付けると、残っていることが 6件 → 4件になる
  const isolateFree = holes.getByRole("checkbox", { name: /^やった バックアップを保存している機器がどこにあり/ });
  const restoreVendor = holes.getByRole("checkbox", { name: /^やった バックアップから戻してみたことがあるか/ });
  await isolateFree.check();
  await expect(holes.getByText("残っていること 5件（全部で6件）")).toBeVisible();
  await restoreVendor.check();
  await expect(holes.getByText("残っていること 4件（全部で6件）")).toBeVisible();
  await expect(isolateFree).toBeChecked();
  await expect(restoreVendor).toBeChecked();
  // 印を変えたので、保存し直しの案内とボタンが出る
  await expect(holes.getByText(/「やった」の印を残すには、もう一度ファイルを保存してください/)).toBeVisible();
  const saveButton = holes.getByRole("button", { name: "続きを再開するためのファイルを保存する（「やった」の印を反映した状態）" });
  await expect(saveButton).toBeVisible();
  await saveScreenshot(page, "item5-done", holes);

  // 保存ボタンでダウンロードしたファイルは版2で、印の ID（固定データの順）を持つ。ファイルは e2e/results/ に置く（git には入れない）
  mkdirSync(RESULTS_DIR, { recursive: true });
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton.click()]);
  expect(download.suggestedFilename()).toMatch(/^サイバー問診_続きを再開するためのファイル_\d{4}-\d{2}-\d{2}\.json$/);
  const savedPath = path.join(RESULTS_DIR, "handover-saved-v2.json");
  await download.saveAs(savedPath);
  const saved = JSON.parse(readFileSync(savedPath, "utf8"));
  expect(saved.format).toBe("cyber-monshin-result");
  expect(saved.version).toBe(2);
  expect(saved.items[0].done).toEqual(["backup.restore.vendor", "backup.isolate.free"]);
  // 保存ファイルに、質問と回答の文や病院名は入らない（今までどおり）
  expect(JSON.stringify(saved)).not.toContain("history");
  // 保存したあとは、保存し直しの案内が消える
  await expect(holes.getByText(/「やった」の印を残すには/)).toHaveCount(0);

  // 保存したファイル（版2）を読み込み直すと、印と残っていることが戻る
  await page.goto("/");
  await page.getByLabel("続きを再開するためのファイルを読み込む").setInputFiles(savedPath);
  await expect(page.getByRole("heading", { name: "問診のまとめ" })).toBeVisible();
  const reloaded = page.getByRole("region", { name: HOLES_REGION });
  await expect(reloaded.getByText("残っていること 4件（全部で6件）")).toBeVisible();
  await expect(reloaded.getByRole("checkbox", { name: /^やった バックアップを保存している機器がどこにあり/ })).toBeChecked();
  await expect(reloaded.getByRole("checkbox", { name: /^やった バックアップから戻してみたことがあるか/ })).toBeChecked();
  await expect(reloaded.getByRole("checkbox", { name: /^やった 最後にバックアップから戻してみた日/ })).not.toBeChecked();
  await expect(reloaded.getByText(/「やった」の印を残すには/)).toHaveCount(0);

  // 説明用の1枚の下のほうに「引き継ぐこと」：残っていること（分類ごとに先頭の文と件数）と、返事待ち（返事でまだ決まっていない要件）
  const sheet = page.locator("#print-sheet");
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "引き継ぐこと" })).toBeVisible();
  await expect(sheet).toContainText("残っていること 4件");
  await expect(sheet).toContainText("今日から院内でできること：最後にバックアップから戻してみた日を、作業報告や記録で探します。");
  await expect(sheet).toContainText("ベンダーに聞くこと：バックアップを、攻撃が届かない場所に分けて保管しているかを聞きます。");
  await expect(sheet).toContainText(
    "予算を立てて検討すること：ネットワークから切り離してバックアップを保管する仕組みを、次にシステムを入れ替えるときに考えます。（ほか1件）",
  );
  // 架空のファイルの要件2つは、どちらも返事でまだ決まっていない（sources がすべて answer）
  await expect(sheet).toContainText(
    "返事待ち 2件（ベンダーに聞いたうち、返事でまだ決まっていないこと）：バックアップから実際にデータを戻す試験をしたことがある／バックアップの控えを、院内のネットワークから切り離した場所に保管している",
  );
  // 「引き継ぐこと」は「この点検の位置づけ」の前（下のほう）にある
  const headings = await sheet.getByRole("heading").allTextContents();
  expect(headings.indexOf("引き継ぐこと")).toBe(headings.indexOf("この点検の位置づけ") - 1);
  // 画面の部品は印刷に出ない（「やった」のチェックボックスも）
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  // 1枚全体の画像（幅 1280）
  await saveScreenshot(page, "item5-print", sheet);

  // 1枚に収まる：A4 の印刷できる幅で測った高さが、印刷できる高さより低い。PDF にしても1ページ
  await page.setViewportSize({ width: PRINTABLE_WIDTH_PX, height: 900 });
  const height = await sheet.evaluate((element) => element.getBoundingClientRect().height);
  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
  writeFileSync(path.join(RESULTS_DIR, "handover-print.pdf"), pdf);
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  // 実測を DEVLOG に書けるよう、高さとページ数を出す
  console.log(`[handover] 説明用の1枚：幅 ${PRINTABLE_WIDTH_PX}px で高さ ${Math.round(height)}px（上限 ${Math.round(PRINTABLE_HEIGHT_PX)}px）、PDF ${pageCount}ページ`);
  expect(pageCount, `1枚の高さ ${Math.round(height)}px`).toBe(1);
  expect(height).toBeLessThan(PRINTABLE_HEIGHT_PX);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ media: "screen" });
  await expect(sheet).toBeHidden();
});

// 次にすることがなければ、1枚には「残っていることはありません」と出る（印を付けるものもない）
test("引き継ぎ：穴がなければ、1枚に「残っていることはありません」と出る", async ({ page }) => {
  // 架空の保存ファイルの状態をすべて「回答で確認」にした版1のファイルを作る（形は e2e/fixtures/saved-result-v1.json と同じ）
  const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "saved-result-v1.json"), "utf8"));
  fixture.items[0].states = { acquire: "confirmed", restore: "confirmed", isolate: "confirmed", procedure: "confirmed" };
  fixture.items[0].vendorQuestions = [];
  mkdirSync(RESULTS_DIR, { recursive: true });
  const noHolesPath = path.join(RESULTS_DIR, "handover-no-holes-v1.json");
  writeFileSync(noHolesPath, JSON.stringify(fixture, null, 2));

  await page.goto("/");
  await page.getByLabel("続きを再開するためのファイルを読み込む").setInputFiles(noHolesPath);
  await expect(page.getByRole("heading", { name: "問診のまとめ" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  const sheet = page.locator("#print-sheet");
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toContainText("残っていることはありません。");
  await expect(sheet).toContainText("返事待ちの質問はありません。");
  await page.emulateMedia({ media: "screen" });
});
