import { expect, test } from "playwright/test";
import { VERDICT_LABELS, VERDICT_MEANINGS } from "../src/lib/verdict";
import { loadSavedResult, verdictCard } from "./helpers";

// 判定の名前の意味の1文と、「残っていること n件」の数え方の1行。Claude は呼ばない。
// 文は固定データ（src/lib/verdict.ts、src/lib/result.ts）から取り、ここでは並び（名前のすぐ下、件数のすぐ下に一覧）を確かめる

const HOLES_REGION = "診療が止まるおそれがあるところと次にすること";

test("判定の意味：判定の名前のすぐ下に、名前の意味の1文があり、その下にこのカードの説明が続く", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // 入口では「去年の回答」。名前の下に、去年の答えであることの1文が出る
  await page.goto("/");
  const card = verdictCard(page);
  await expect(card.locator("#verdict-meaning")).toHaveText(VERDICT_MEANINGS.reviewing);

  // 架空の保存ファイルは「はい（書類上だけ）」（取得はできていて、戻す確認がわからない、切り離しができていない）
  await loadSavedResult(page);
  const label = card.locator("#verdict-label");
  const meaning = card.locator("#verdict-meaning");
  const note = card.locator("#verdict-note");
  await expect(label).toHaveText(VERDICT_LABELS.paper_only);
  await expect(meaning).toHaveText(VERDICT_MEANINGS.paper_only);
  // 3つは同じ色の箱の中で、名前 → 意味 → 説明の順に、間をあけずに並ぶ
  const box = label.locator("xpath=..");
  await expect(box.locator("xpath=./p")).toHaveCount(3);
  const [labelBox, meaningBox, noteBox] = await Promise.all([label, meaning, note].map((part) => part.boundingBox()));
  expect(meaningBox!.y).toBeGreaterThanOrEqual(labelBox!.y + labelBox!.height - 1);
  expect(meaningBox!.y - (labelBox!.y + labelBox!.height)).toBeLessThan(16);
  expect(noteBox!.y).toBeGreaterThanOrEqual(meaningBox!.y + meaningBox!.height - 1);
  // 意味の1文と説明は役割を分ける：説明は、このカードの観点の名前（「」で囲む）を言い、意味の1文は観点の名前を言わない
  await expect(note).toContainText("「バックアップを取る」");
  await expect(meaning).not.toContainText("「バックアップ");
  // 意味の1文は、名前と同じく 1280×800 の画面に入る
  await expect(meaning).toBeInViewport();

  // 説明用の1枚にも、判定の見出しのすぐ下に同じ1文が出る
  await page.emulateMedia({ media: "print" });
  const sheet = page.locator("#print-sheet");
  const heading = sheet.getByRole("heading", { name: `判定：${VERDICT_LABELS.paper_only}` });
  await expect(heading.locator("xpath=following-sibling::*[1]")).toHaveText(VERDICT_MEANINGS.paper_only);
});

test("残っていること：件数のすぐ下に何を数えたかの1行があり、そのすぐ下から分類ごとの一覧が始まり、分類の件数を足すと全部の件数になる", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loadSavedResult(page);
  const holes = page.getByRole("region", { name: HOLES_REGION });
  const count = holes.locator("#steps-count");
  const countNote = holes.locator("#steps-count-note");
  await expect(count).toBeVisible();

  // 止まるおそれは2件（戻す確認、切り離し）。数え方の1行は、その件数と全部の件数を式で示す
  const holeItems = holes.locator("ol > li");
  const holeCount = await holeItems.count();
  const checkboxes = holes.getByRole("checkbox");
  const total = await checkboxes.count();
  expect(total).toBe(holeCount * 3);
  await expect(countNote).toContainText(`（${holeCount}件×3＝${total}件）`);

  // 分類の見出しは3つ（h4）。見出しの件数を足すと全部の件数になり、分類ごとの一覧の項目の数とも合う
  const groupHeadings = holes.getByRole("heading", { level: 4 });
  await expect(groupHeadings).toHaveCount(3);
  let sum = 0;
  for (const heading of await groupHeadings.all()) {
    const n = Number((await heading.textContent())?.match(/（(\d+)件）$/)?.[1]);
    const items = heading.locator("xpath=following-sibling::ul[1]/li");
    await expect(items).toHaveCount(n);
    sum += n;
  }
  expect(sum).toBe(total);

  // 件数 → 数え方の1行 → 最初の分類の見出し、の順に、間に別の段落をはさまずに続く（一覧が閉じて見えないように）
  await count.scrollIntoViewIfNeeded();
  const [countBox, noteBox, firstGroupBox] = await Promise.all(
    [count, countNote, groupHeadings.first()].map((part) => part.boundingBox()),
  );
  expect(noteBox!.y).toBeGreaterThan(countBox!.y);
  expect(firstGroupBox!.y).toBeGreaterThan(noteBox!.y);
  expect(firstGroupBox!.y - (noteBox!.y + noteBox!.height)).toBeLessThan(48);
  // 件数が見えている位置で、最初の分類の最初の「やった」の欄も同じ画面に見える
  await expect(checkboxes.first()).toBeInViewport();

  // 「やった」の印を付けると、残っていることの件数だけが減り、数え方の1行（全部の件数）は変わらない
  await checkboxes.first().check();
  await expect(count).toContainText(`残っていること ${total - 1}件`);
  await expect(countNote).toContainText(`（${holeCount}件×3＝${total}件）`);
});
