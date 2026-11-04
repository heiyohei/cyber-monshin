import { expect, test, type Page, type Route } from "playwright/test";
import { LONG_WAIT_SECONDS, LONG_WAIT_TEXT, WAIT_TEXTS } from "../src/lib/wait";
import { loadSavedResult } from "./helpers";

// 待っている間の表示。Claude は呼ばず、ブラウザの通信を差し替えて、返事を止めておく。
// 確かめるのは並びと動き（見ている場所に出る、回る輪と秒数がある、動きを減らす設定で回らない、読み上げは1か所）

const FIRST = {
  type: "question",
  text: "（テスト）1問目の質問です。",
  why: "（テスト）理由です。",
  options: ["毎日取っている", "わからない"],
};

function interviewBody(): string {
  return [
    JSON.stringify(FIRST),
    JSON.stringify({ type: "session", session: { payload: JSON.stringify({ step: 1 }), signature: "test" } }),
    "",
  ].join("\n");
}

// 1回目（最初の質問）はすぐ返し、2回目（回答）は返事を返さずに止めておく
async function holdAnswer(page: Page) {
  let calls = 0;
  await page.route("**/api/interview", async (route: Route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: interviewBody() });
      return;
    }
    await new Promise(() => {});
  });
}

async function sendOptionAfterScroll(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルで試す" }).click();
  await expect(page.getByRole("heading", { name: /^質問に答える/ })).toBeVisible();
  // 回答欄の近くまで下に動かしてから押す（事務職員役は、押したあと画面の上の細い文字しか変わらず、固まったように見えた）
  const option = page.getByRole("button", { name: "毎日取っている" });
  await page.getByRole("button", { name: "回答する" }).scrollIntoViewIfNeeded();
  await option.click();
}

// 左の列の上の待ちの表示（質問と回答欄があった場所）
function topWait(page: Page) {
  return page.getByRole("region", { name: "問診とベンダーの返事" }).locator("[data-wait-panel]");
}

test("待ち：回答を送ると、見えている所に回る輪と案内と待っている秒数が出て、秒数が進み、長く待つと案内が足される", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 800 });
  await holdAnswer(page);
  await sendOptionAfterScroll(page);

  const panel = topWait(page);
  await expect(panel).toHaveCount(1);
  // 画面に入るように動かす（押した場所から離れても、待っていることが目に入る）
  await expect(panel).toBeInViewport({ ratio: 1 });
  // 回る輪は飾りなので読み上げない。案内の文は送った答えと、実測に合わせた待ちの文
  await expect(panel.locator("[data-spinner]")).toHaveAttribute("aria-hidden", "true");
  const live = panel.locator("[aria-live]");
  await expect(live).toHaveCount(1);
  await expect(live).toHaveText(`「毎日取っている」を送りました。${WAIT_TEXTS.answer}`);
  // 待っている秒数は読み上げの領域の外（1秒ごとに読み上げさせない）
  const seconds = panel.getByText(/^待っている時間：\d+秒$/);
  await expect(seconds).toHaveText("待っている時間：0秒");
  await expect(live.getByText(/待っている時間/)).toHaveCount(0);
  // 待ちの表示は1つだけ（返事の欄のそばには出さない）
  await expect(page.locator("[data-wait-panel]")).toHaveCount(1);

  await page.clock.runFor(3_000);
  await expect(seconds).toHaveText("待っている時間：3秒");
  await expect(panel).not.toContainText(LONG_WAIT_TEXT);
  // 長く待つと、いつもより長いことを、見た目と読み上げの領域の両方に足す
  await page.clock.runFor((LONG_WAIT_SECONDS - 3) * 1000);
  await expect(seconds).toHaveText(`待っている時間：${LONG_WAIT_SECONDS}秒`);
  await expect(live).toContainText(LONG_WAIT_TEXT);
});

test("待ち：動きを減らす設定のときは、輪を回さない（秒数は進む）", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await holdAnswer(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await sendOptionAfterScroll(page);
  const spinner = topWait(page).locator("[data-spinner]");
  await expect(spinner).toBeVisible();
  expect(await spinner.evaluate((element) => getComputedStyle(element).animationName)).not.toBe("none");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => spinner.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect(topWait(page).getByText(/^待っている時間：[1-9]\d*秒$/)).toBeVisible({ timeout: 5_000 });
});

test("待ち：返事を確かめるときは、押したボタンのすぐ下に待ちの表示が出て、左の列の上には出ない", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/api/verify-reply", async () => {
    await new Promise(() => {});
  });
  await loadSavedResult(page);
  await page.getByLabel(/^返事（/).fill("（テスト）戻す試験は昨年行いました。");
  const button = page.getByRole("button", { name: "返事を確かめる" });
  await button.click();

  const panel = page.locator("[data-wait-panel]");
  await expect(panel).toHaveCount(1);
  // ボタンの次の要素が待ちの表示
  await expect(button.locator("xpath=following-sibling::*[1]")).toHaveAttribute("data-wait-panel", "");
  await expect(panel).toBeInViewport();
  await expect(panel).toContainText(WAIT_TEXTS.reply);
  // 読み上げは左の列の上の領域（見た目は隠す）が受け持つ
  const live = page.getByRole("region", { name: "問診とベンダーの返事" }).locator("[aria-live]").first();
  await expect(live).toHaveText(WAIT_TEXTS.reply);
  await expect(live).toHaveClass(/sr-only/);
});
