import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "playwright/test";
import { verdictCard } from "./helpers";

// 厚生労働省の様式は git に入れない。手元の samples/（または E2E_SAMPLES_DIR）に
// 架空の記入例の .xlsx があるときだけ動かし、なければ飛ばす
const samplesDir = process.env.E2E_SAMPLES_DIR ?? path.resolve("samples");
const xlsxFiles = existsSync(samplesDir) ? readdirSync(samplesDir).filter((name) => name.endsWith(".xlsx")) : [];
const hospitalFile = xlsxFiles.find((name) => name.includes("医療機関"));
const vendorFile = xlsxFiles.find((name) => name.includes("事業者"));

// Excel はブラウザの中で読む決まりなので、読み込みの間にサーバーへ送る要求（POST）を数えて、0件であることを確かめる
function watchPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  return posts;
}

// 去年の回答の一覧の表。行は「この対策を選ぶ」のボタンがある5行（見出しの行は除く）
function overviewRows(page: Page) {
  const table = page.getByRole("table", { name: "去年の回答の一覧（重点項目5つ）" });
  return table.getByRole("row").filter({ has: page.getByRole("button", { name: /この対策を選ぶ/ }) });
}

// 行のボタン。読み上げ名は「この対策を選ぶ（対策の名前）」で、名前は読み上げ用の隠した文字なので、間に空白が入ることがある
function chooseButton(page: Page, itemName: string) {
  return overviewRows(page).getByRole("button", { name: new RegExp(`^この対策を選ぶ\\s*（${itemName}）$`) });
}

test("Excel の読み込み：去年の回答をブラウザの中で読み取り、5項目の一覧を出す。サーバーへは送らない", async ({ page }) => {
  test.skip(!hospitalFile, `医療機関用の .xlsx が ${samplesDir} にないので飛ばします`);

  await page.goto("/");
  const posts = watchPosts(page);

  await page.getByLabel("Excel を読み込む").setInputFiles(path.join(samplesDir, hospitalFile!));

  // 既定の対策はバックアップと復旧（チェック項目 3-②）
  await expect(
    page.getByText("バックアップと復旧（3-②）の去年の回答を読み取りました。違っていれば選び直してください。"),
  ).toBeVisible();
  await expect(page.getByLabel("3-② の去年の回答")).toHaveValue(/^(yes|no)$/);
  await expect(page.getByRole("button", { name: "この回答で問診を始める" })).toBeVisible();

  // 一覧の表：重点項目5つが攻撃の流れの順に並ぶ
  const rows = overviewRows(page);
  await expect(rows).toHaveCount(5);
  await expect(rows).toHaveText([
    /機器と外部接続の把握/,
    /更新プログラム/,
    /アカウントと権限/,
    /バックアップと復旧/,
    /診療を止めない備え/,
  ]);
  // セルは、対策（攻撃の流れ、チェック項目、選ぶボタン）、去年の回答、ベンダーの回答、気になる点、の順
  const backupRow = rows.filter({ hasText: "バックアップと復旧" });
  await expect(backupRow).toHaveAttribute("aria-current", "true");
  await expect(backupRow.getByRole("cell").nth(0)).toContainText("チェック項目 3-②");
  await expect(backupRow.getByRole("cell").nth(1)).toHaveText(/^(はい|いいえ)$/);
  // バックアップには事業者用の項目がない
  await expect(backupRow.getByRole("cell").nth(2)).toHaveText("事業者用に項目がない");

  // 別の行の「この対策を選ぶ」を押すと、その対策が「確かめる対策」になり、選択欄の見出しがその番号に変わる。
  // Excel の読み取りは捨てないので、選び直しは要らない
  await chooseButton(page, "更新プログラム").click();
  await expect(
    page.getByText("更新プログラム（2-⑥）の去年の回答を読み取りました。違っていれば選び直してください。"),
  ).toBeFocused();
  await expect(page.getByLabel("2-⑥ の去年の回答")).toHaveValue(/^(yes|no)$/);
  // 事業者用のシートを読み込んでいないので、ベンダーの回答は要確認
  await expect(page.getByLabel("事業者用チェックリスト 2-⑥ の、ベンダーの回答")).toHaveValue("unknown");
  await expect(page.getByText("いまは「更新プログラム」（チェック項目 2-⑥）です。")).toBeVisible();
  await expect(rows.filter({ hasText: "更新プログラム" })).toHaveAttribute("aria-current", "true");
  await expect(backupRow).not.toHaveAttribute("aria-current", "true");

  // 「1. 確かめる対策を選ぶ」（たたんである）から変えても、選択欄はその対策の読み取り結果に切り替わる
  await page.locator("summary", { hasText: "ほかの対策から選ぶ" }).click();
  await page.getByRole("radio", { name: /バックアップと復旧/ }).check();
  await expect(page.getByLabel("3-② の去年の回答")).toHaveValue(/^(yes|no)$/);
  await expect(backupRow).toHaveAttribute("aria-current", "true");

  expect(posts).toEqual([]);
});

test("Excel の読み込み：事業者用も一緒に読むと、ベンダーの回答と「対象外」の気になる点が出る", async ({ page }) => {
  test.skip(!hospitalFile || !vendorFile, `医療機関用と事業者用の .xlsx が ${samplesDir} にそろっていないので飛ばします`);

  await page.goto("/");
  const posts = watchPosts(page);

  await page
    .getByLabel("Excel を読み込む")
    .setInputFiles([path.join(samplesDir, hospitalFile!), path.join(samplesDir, vendorFile!)]);

  const rows = overviewRows(page);
  await expect(rows).toHaveCount(5);
  // 手元の架空の記入例では、更新プログラムはベンダーが「対象外」、アカウントと権限は去年が「いいえ」でベンダーが「対象外」。
  // 「対象外」のすき間（事業者が対象外にした項目は病院の責任になる）を、気になる点に出す
  const updateRow = rows.filter({ hasText: "更新プログラム" });
  await expect(updateRow.getByRole("cell").nth(2)).toHaveText("対象外");
  await expect(updateRow.getByRole("cell").nth(3)).toHaveText("ベンダーが対象外にしています。病院の側で、誰が行うか確かめてください");
  const accountsRow = rows.filter({ hasText: "アカウントと権限" });
  await expect(accountsRow.getByRole("cell").nth(1)).toHaveText("いいえ");
  await expect(accountsRow.getByRole("cell").nth(3)).toContainText("去年の回答に「いいえ」があります");
  await expect(accountsRow.getByRole("cell").nth(3)).toContainText("ベンダーが対象外にしています。病院の側で、誰が行うか確かめてください");
  // 気になる点がない行は空
  const devicesRow = rows.filter({ hasText: "機器と外部接続の把握" });
  await expect(devicesRow.getByRole("cell").nth(2)).toHaveText("はい");
  await expect(devicesRow.getByRole("cell").nth(3)).toHaveText("");

  // 行から選ぶと、ベンダーの回答の選択欄にも読み取り結果が入る
  await chooseButton(page, "更新プログラム").click();
  await expect(page.getByLabel("事業者用チェックリスト 2-⑥ の、ベンダーの回答")).toHaveValue("not_applicable");

  // 右の判定カードの「去年の回答」も、サンプルの値ではなく、Excel から読んだ値になる
  await chooseButton(page, "アカウントと権限").click();
  await expect(page.getByLabel(/の去年の回答$/)).toHaveValue("no");
  await expect(verdictCard(page).getByText("去年の回答：いいえ", { exact: true })).toBeVisible();

  expect(posts).toEqual([]);
});
