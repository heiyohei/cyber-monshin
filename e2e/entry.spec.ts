import { expect, test, type Page } from "playwright/test";
import { SAVED_RESULT_FIXTURE } from "./helpers";

// 入口の画面。Claude は呼ばない

// 「2. 始め方を1つ選ぶ」の欄と、その中の3つの始め方（h3 の見出しごとの箱）
function startSection(page: Page) {
  return page.getByRole("region", { name: "2. 始め方を1つ選ぶ" });
}

// 押したボタンを含む始め方の箱（見出しの言葉に頼らず、ボタンから箱をたどる）
function panelOf(page: Page, button: ReturnType<Page["getByRole"]>) {
  return startSection(page).locator("section").filter({ has: button });
}

test("入口：1280×800 の最初の画面に「サンプルで試す」が入り、3つの始め方と注意書きが見える", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "病院のサイバー問診アシスタント" })).toBeVisible();

  // 始め方は3つ（サンプル、Excel、保存ファイル）。それぞれ見出しと、押す部品が1つずつある
  const start = startSection(page);
  await expect(start.getByRole("heading", { level: 3 })).toHaveCount(3);
  const sample = page.getByRole("button", { name: "サンプルで試す" });
  await expect(sample).toHaveCount(1);
  // スクロールしなくても見える（デジタル庁の指針：重要なボタンをスクロールの下に置かない）
  await expect(sample).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel("Excel を読み込む")).toBeAttached();
  await expect(page.getByLabel("続きを再開するためのファイルを読み込む")).toBeAttached();
  // 見出しとボタンに同じ言葉を使わない（同じ言葉が2回続くと、どちらを押すのか迷う）
  const headings = await start.getByRole("heading", { level: 3 }).allTextContents();
  expect(headings.map((text) => text.trim())).not.toContain("サンプルで試す");

  // 注意書き：公開するときの表示（保証しない、公式でない、架空）と、患者さんの情報を入力しないことは、たたんだ欄を開かなくても見える
  const lead = page.locator("p").filter({ hasText: "患者さんの情報は入力しないでください。" }).first();
  await expect(lead).toBeVisible();
  await expect(lead).toContainText("対策が基準を満たしていると保証するものではなく、法的な判断もしません。");
  await expect(lead).toContainText("厚生労働省の公式ツールではありません。");
  await expect(lead).toContainText("黒戸（くろうど）記念病院と黒戸町は架空です。");
  // くわしい5項目は、問診中と同じ「このアプリについて（…）」にたたんで残す。開くと見える
  const about = page.locator("details").filter({ has: page.locator("summary", { hasText: /^このアプリについて/ }) });
  await expect(about).not.toHaveAttribute("open", "");
  await expect(about.locator("li")).toHaveCount(5);
  await expect(about.locator("li").first()).toBeHidden();
  await about.locator("summary").click();
  await expect(about.locator("li")).toHaveText([
    /AI（Anthropic 社の Claude）へ送ります。/,
    "対策が基準を満たしていると保証するものではなく、法的な判断もしません。",
    "厚生労働省の公式ツールではありません。",
    /重点項目5つを確かめます。/,
    "黒戸（くろうど）記念病院と黒戸町は架空です。",
  ]);

  // 使い方の流れは、始め方のあとに残す
  await expect(page.getByRole("heading", { name: "使い方の流れ" })).toBeAttached();
});

// 本番で合言葉（ACCESS_CODE）があるときの動き。e2e のサーバーは合言葉なしで動くので、
// ブラウザの通信を差し替えて 401 を返し、画面の動きだけを確かめる（Claude は呼ばない）
test("合言葉：「サンプルで試す」のあとに要るときは、押したボタンのすぐ下に欄が出て、確かめたら続きを進める", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  let interviewCalls = 0;
  await page.route("**/api/interview", async (route) => {
    interviewCalls += 1;
    // 1回目は合言葉がまだ（proxy.ts と同じ形の 401）。合言葉を確かめたあとの2回目は、Claude を呼ばないよう止める
    await route.fulfill(
      interviewCalls === 1
        ? {
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ error: "合言葉の確認が、まだ終わっていません。すぐ下の欄に合言葉を入れて「合言葉を確かめる」を押してください。" }),
          }
        : { status: 503, contentType: "application/json", body: JSON.stringify({ error: "（テスト）ここで止めます。" }) },
    );
  });
  let accessCalls = 0;
  await page.route("**/api/access", async (route) => {
    accessCalls += 1;
    await route.fulfill(
      accessCalls === 1
        ? { status: 401, contentType: "application/json", body: JSON.stringify({ error: "合言葉が違います。もう一度入力してください。" }) }
        : { status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) },
    );
  });

  await page.goto("/");
  const sample = page.getByRole("button", { name: "サンプルで試す" });
  await sample.click();

  // 欄は、押したボタンと同じ箱の中に出て、焦点が欄に移る。画面の上のエラーの箱は出ない
  const form = page.getByRole("form", { name: "合言葉の確認" });
  await expect(form).toHaveCount(1);
  await expect(panelOf(page, sample).getByRole("form", { name: "合言葉の確認" })).toBeVisible();
  const input = form.getByLabel(/^合言葉/);
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("type", "password");
  await expect(form).toContainText("合言葉の確認が、まだ終わっていません。");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  // 押したボタンも、欄も、見えている範囲にある（画面の上へ飛ばない）
  await expect(sample).toBeInViewport();
  await expect(form.getByRole("button", { name: "合言葉を確かめる" })).toBeInViewport();
  // 欄が出たことに気づけるように（2周目）：欄は押したボタンの次の要素で、欄の先頭は見出し（始め方の見出し h3 の下なので h4）。
  // 欄の全体が見えている範囲に入る。焦点が来たときに、確かめたあとどうなるかの文も読み上げる
  await expect(sample.locator("xpath=following-sibling::*[1]")).toHaveAttribute("data-code-form", "");
  const heading = form.getByRole("heading", { level: 4 });
  await expect(heading).toHaveCount(1);
  await expect(form.locator("xpath=./*[1]")).toHaveAttribute("id", "access-code-heading");
  await expect(form).toBeInViewport({ ratio: 1 });
  const describedBy = (await input.getAttribute("aria-describedby"))?.split(" ") ?? [];
  expect(describedBy).toEqual(["access-code-message", "access-code-after"]);
  await expect(form.locator("#access-code-after")).not.toBeEmpty();
  // 出たときに一度だけ背景の色を変える。動きを減らす設定のときは変えない
  expect(await form.evaluate((element) => getComputedStyle(element).animationName)).toBe("code-appear");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => form.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // 違うときは、同じ欄に知らせが出て、欄は残る
  await input.fill("ちがう");
  await form.getByRole("button", { name: "合言葉を確かめる" }).click();
  await expect(form).toContainText("合言葉が違います。もう一度入力してください。");
  await expect(input).toBeFocused();

  // 正しければ欄が消え、止まった操作（最初の質問を用意する）を自動で続ける
  await input.fill("せいかい");
  await form.getByRole("button", { name: "合言葉を確かめる" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("（テスト）ここで止めます。");
  expect(interviewCalls).toBe(2);
});

test("合言葉：保存ファイルの読み込みで要るときは、読み込みのボタンの下に欄が出て、確かめたら同じファイルで続ける", async ({ page }) => {
  let loadCalls = 0;
  await page.route("**/api/load-result", async (route) => {
    loadCalls += 1;
    // 1回目だけ 401。2回目は開発サーバーへそのまま送る（保存ファイルの検証は Claude を呼ばない）
    if (loadCalls === 1) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "合言葉の確認が、まだ終わっていません。すぐ下の欄に合言葉を入れて「合言葉を確かめる」を押してください。" }),
      });
    } else {
      await route.continue();
    }
  });
  await page.route("**/api/access", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );

  await page.goto("/");
  const resume = page.getByLabel("続きを再開するためのファイルを読み込む");
  await resume.setInputFiles(SAVED_RESULT_FIXTURE);
  const form = panelOf(page, page.locator("label").filter({ has: resume })).getByRole("form", { name: "合言葉の確認" });
  await expect(form).toBeVisible();
  await form.getByLabel(/^合言葉/).fill("せいかい");
  await form.getByRole("button", { name: "合言葉を確かめる" }).click();

  // ファイルを選び直さなくても、結果の画面になる
  await expect(page.getByRole("heading", { name: "問診のまとめ" })).toBeVisible();
  expect(loadCalls).toBe(2);
});

test("エラー：存在しないページで日本語の 404 が出る", async ({ page }) => {
  const response = await page.goto("/sonzai-shinai-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
  await expect(page.getByRole("link", { name: "最初のページへ戻る" })).toBeVisible();
});
