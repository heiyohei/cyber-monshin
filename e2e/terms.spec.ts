import { expect, test } from "playwright/test";
import { loadSavedResult, verdictCard } from "./helpers";

// 質問や根拠の中の言葉を押すと出る短い説明。固定データ（src/data/terms.ts）から出し、Claude は呼ばない。
// 結果の画面（保存ファイルの読み込み）には、チェック項目と根拠の原文が出るので、ここで確かめる
test("用語の説明：根拠の原文の言葉を押すと短い説明が開き、もう一度押すと閉じる", async ({ page }) => {
  await loadSavedResult(page);
  const card = verdictCard(page);

  // チェック項目 3-② の原文「…バックアップを確保のうえ…」の「バックアップ」がボタンになる。原文の文字は変えない。
  // 「：」まで含めて、対策の名前の行「バックアップと復旧（チェック項目 3-②）」と区別する
  const checkItem = card.locator("p", { hasText: "チェック項目 3-②：" });
  await expect(checkItem).toContainText(
    "チェック項目 3-②：インシデント発生時に診療を継続するために必要な情報を検討し、バックアップを確保のうえ、復旧手順を確認している。",
  );
  const button = checkItem.getByRole("button", { name: "バックアップ", exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // 押すと、その文のすぐ下に説明の箱が開く
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  const boxId = await button.getAttribute("aria-controls");
  expect(boxId).toBeTruthy();
  const box = checkItem.locator(`[id="${boxId}"]`);
  await expect(box).toBeVisible();
  await expect(box).toContainText("バックアップ");
  await expect(box).toContainText("データの控えを、別の場所に取っておくこと。");
  // このアプリで作った説明だと分かる。問診の途中ではないので、ことばの相談へつなぐボタンは出ない
  await expect(box).toContainText("このアプリで作った説明で、厚生労働省の資料の文ではありません");
  await expect(box.getByRole("button", { name: /ことばの相談で詳しく聞く/ })).toHaveCount(0);
  await expect(box.getByRole("button", { name: /^閉じる/ })).toBeVisible();

  // もう一度押すと閉じる
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(box).toBeHidden();

  // 同じ文の別の言葉（復旧手順）を押すと、その説明に切り替わる。「閉じる」で閉じると焦点が言葉のボタンへ戻る
  const procedure = checkItem.getByRole("button", { name: "復旧手順", exact: true });
  await procedure.click();
  await expect(box).toContainText("誰が何をどの順番で行えば元に戻せるかを書いた手順のこと。");
  await box.getByRole("button", { name: /^閉じる/ }).click();
  await expect(box).toBeHidden();
  await expect(procedure).toBeFocused();
});

test("用語の説明：キーボードでも開ける（Tab で着いて Enter）", async ({ page }) => {
  await loadSavedResult(page);
  const checkItem = verdictCard(page).locator("p", { hasText: "チェック項目 3-②：" });
  const first = checkItem.getByRole("button", { name: "インシデント", exact: true });
  const second = checkItem.getByRole("button", { name: "バックアップ", exact: true });

  // 最初の言葉から Tab で次の言葉に着き、Enter で開く。スペースで閉じる
  await first.focus();
  await page.keyboard.press("Tab");
  await expect(second).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-expanded", "true");
  const box = checkItem.locator(`[id="${await second.getAttribute("aria-controls")}"]`);
  await expect(box).toBeVisible();
  await page.keyboard.press("Space");
  await expect(second).toHaveAttribute("aria-expanded", "false");
  await expect(box).toBeHidden();
});

// ベンダーへの質問文と「（参考）…原文を引用します」の中の用語にも、同じ点線の下線の説明が出る。
// コピーのボタンで写す文には、説明の文字が混ざらない
test("用語の説明：ベンダーへの質問文と引用の中の言葉にも説明が出て、コピーする文には入らない", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadSavedResult(page);
  const message = page.locator("p").filter({ hasText: "質問の文は当院で作ったもので" });
  await expect(message).toHaveCount(1);

  // 質問文の行（保存した質問）と、引用の行（根拠の原文）の両方に、用語のボタンがある
  const questionLine = message.locator("span.block").filter({ hasText: "バックアップの控えは、院内のネットワーク" });
  await expect(questionLine.getByRole("button", { name: "ネットワーク", exact: true })).toBeVisible();
  const quoteLine = message.locator("span.block").filter({ hasText: "バックアップデータの記録媒体を" });
  const term = quoteLine.getByRole("button", { name: "記録媒体", exact: true });
  await expect(term).toBeVisible();

  // 押すと、その行のすぐ下に説明の箱が開く
  await term.click();
  await expect(term).toHaveAttribute("aria-expanded", "true");
  const box = page.locator(`[id="${await term.getAttribute("aria-controls")}"]`);
  await expect(box).toBeVisible();
  await expect(box).toContainText("データを書き込んで残しておく入れ物のこと。");
  // 問診の途中ではないので、ことばの相談へつなぐボタンは出ない
  await expect(box.getByRole("button", { name: /ことばの相談で詳しく聞く/ })).toHaveCount(0);

  // 箱を開いたままコピーしても、写る文は元の質問文だけ（説明の文字は入らない）
  await page.getByRole("button", { name: "質問文をコピーする" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("バックアップデータの記録媒体を端末及びサーバ装置やネットワークから切り離して保管することが強く求められる。");
  expect(copied).not.toContain("データを書き込んで残しておく入れ物のこと。");
  expect(copied).not.toContain("このアプリで作った説明");
  // 画面の質問文の箱の文字（説明の箱を除く）と、コピーした文が同じ
  await term.click();
  await expect(box).toBeHidden();
  expect((await message.innerText()).replace(/\s+/g, "")).toBe(copied.replace(/\s+/g, ""));
});

test("用語の説明：印刷の表示では言葉のボタンが出ない", async ({ page }) => {
  await loadSavedResult(page);
  const button = verdictCard(page).getByRole("button", { name: "バックアップ", exact: true }).first();
  await expect(button).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(button).toBeHidden();
  // 説明用の1枚にはボタンを置かない
  const sheet = page.locator("#print-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button")).toHaveCount(0);
  await page.emulateMedia({ media: "screen" });
  await expect(button).toBeVisible();
});
