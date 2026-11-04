import { expect, test } from "playwright/test";
import { BACKUP_ITEM } from "../src/data/backup";
import { expectVerdictComputedFromCard, loadSavedResult, verdictCard } from "./helpers";

// 画面に出る観点名は、固定データの表示名（label）。Claude に渡す観点名（name）は画面に出ない
const LABEL = Object.fromEntries(BACKUP_ITEM.viewpoints.map((viewpoint) => [viewpoint.id, viewpoint.label]));
const NAMES = BACKUP_ITEM.viewpoints.map((viewpoint) => viewpoint.name);

// 保存ファイルを読み込むと、判定、止まる穴、次にすること、質問文、説明用の1枚が、固定データから出る。Claude は呼ばない。
// 照合する文は src/data/backup.ts の固定データと、e2e/fixtures/saved-result-v1.json の値
test("保存ファイルの読み込み：結果の画面が固定データから出る", async ({ page }) => {
  await loadSavedResult(page);

  // 読み込んだ案内（保存した日は固定データの savedAt から）。同じ文が読み上げ用の領域にも入るので、返事の欄の中だけを見る
  await expect(
    page.locator("form").getByText("11月1日に保存した結果を読み込みました。ベンダーの返事を下に貼り付けてください。"),
  ).toBeVisible();

  // 判定はコードが計算する。最も重い観点（acquire）が「できている（回答から）」で、ほかに穴があるので「はい（書類上だけ）」
  const card = verdictCard(page);
  await expect(card.getByText("はい（書類上だけ）", { exact: true })).toBeVisible();
  await expect(card.getByText(`${LABEL.acquire}：できている（回答から）`)).toBeVisible();
  await expect(card.getByText(`${LABEL.restore}：わからない`)).toBeVisible();
  await expect(card.getByText(`${LABEL.isolate}：できていない`)).toBeVisible();
  await expect(card.getByText(`${LABEL.procedure}：できている（回答から）`)).toBeVisible();
  // Claude に渡す観点名（取得、戻す確認など）は、判定カードに出ない
  for (const name of NAMES) await expect(card.getByText(new RegExp(`^${name}：`))).toHaveCount(0);
  await expectVerdictComputedFromCard(page);

  // まとめの表に、保存した「分かったこと」が出る
  const summary = page.getByRole("region", { name: "問診のまとめ" });
  await expect(summary.getByRole("row", { name: new RegExp(LABEL.restore) })).toContainText("分からないとの回答でした");
  // 保存ファイルには質問と回答が入っていないので、「これまでの質問と回答」の欄は出ない
  await expect(page.getByText(/^これまでの質問と回答/)).toHaveCount(0);

  // 止まる穴は影響の順位（固定データ）で並ぶ。isolate（できていない）→ restore（わからない）
  const holes = page.getByRole("region", { name: "診療が止まるおそれがあるところと次にすること" });
  const holeItems = holes.locator("ol > li");
  await expect(holeItems).toHaveCount(2);
  await expect(holeItems.nth(0)).toContainText(`${LABEL.isolate}：バックアップが、ふだん使う機器につながったままです。`);
  await expect(holeItems.nth(1)).toContainText(`${LABEL.restore}：「控えから実際に戻せることを確かめたことがある」かどうかが分かりません。`);

  // 次にすること（固定データの文）
  await expect(holes.getByRole("heading", { name: "次にすること" })).toBeVisible();
  await expect(holes.getByRole("heading", { level: 4, name: /^今日から院内でできること/ })).toBeVisible();
  await expect(
    holes.getByRole("listitem").getByText("バックアップを保存している機器がどこにあり、ふだんつながったままかを、院内で確かめます。"),
  ).toBeVisible();

  // ベンダーへの質問文。保存した質問に、根拠の原文と「厚生労働省が示したものではない」の一文をコードが添える
  await expect(page.getByRole("heading", { name: "1. ベンダーに質問文を送る" })).toBeVisible();
  // 質問文は行ごとに用語の印を付けて出すので、文全体を入れた段落（見出しのすぐあとの、質問文の箱）を取る
  const message = page.locator("p").filter({ hasText: "バックアップについて、次の点を、はい／いいえで教えてください。" });
  await expect(message).toContainText("質問の文は当院で作ったもので、厚生労働省が示したものではありません。");
  await expect(message).toContainText("復旧テストなどを実施することが求められる");
  await expect(page.getByRole("button", { name: "質問文をコピーする" })).toBeVisible();

  // 返事を貼る欄と、保存と印刷のボタン
  await expect(page.getByLabel(/^返事（/)).toBeVisible();
  await expect(page.getByRole("button", { name: "続きを再開するためのファイルを保存する", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "説明用の1枚を印刷する" })).toBeVisible();

  // 説明用の1枚は印刷のときだけ表示される
  const sheet = page.locator("#print-sheet");
  await expect(sheet).toBeHidden();
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "サイバー対策の点検結果（バックアップと復旧）" })).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "判定：はい（書類上だけ）" })).toBeVisible();
  await expect(sheet).toContainText(
    `確かめたこと：${LABEL.acquire}：できている（回答から）／${LABEL.restore}：わからない／${LABEL.isolate}：できていない／${LABEL.procedure}：できている（回答から）`,
  );
  await expect(sheet.getByRole("heading", { name: "このままだと診療が止まるおそれがあるところ" })).toBeVisible();
  await expect(sheet).toContainText("実地の確認ではありません。");
  await page.emulateMedia({ media: "screen" });
  await expect(sheet).toBeHidden();
});
