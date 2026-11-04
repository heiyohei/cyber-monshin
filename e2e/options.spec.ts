import { expect, test, type Page, type Route } from "playwright/test";

// 問診の選択肢。押したら、その文をそのまま回答として送る。
// Claude を呼ばないよう、ブラウザの通信を差し替えて、サーバーの返事（1行ずつの JSON）を作る。
// 画面の動きだけを確かめる（送る中身、送ったことの表示、二重に送らないこと、キーボードで押せること）

type Question = { text: string; why: string; options: string[] };

// サーバーが返す形：質問と、署名つきの状態（中身は画面では読まないので、形だけ合わせる）
function interviewBody(question: Question, step: number): string {
  return [
    JSON.stringify({ type: "question", ...question }),
    JSON.stringify({ type: "session", session: { payload: JSON.stringify({ step }), signature: "test" } }),
    "",
  ].join("\n");
}

const FIRST: Question = {
  text: "（テスト）1問目の質問です。",
  why: "（テスト）理由です。",
  options: ["毎日取っている", "取っていない", "わからない"],
};
const SECOND: Question = { text: "（テスト）2問目の質問です。", why: "（テスト）理由です。", options: ["はい", "わからない"] };

// 送られた回答を記録し、2回目（回答）の返事は release() を呼ぶまで止めておく（送っている間の画面を見るため）
async function mockInterview(page: Page) {
  const answers: (string | undefined)[] = [];
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/interview", async (route: Route) => {
    const body = route.request().postDataJSON() as { answer?: string };
    answers.push(body.answer);
    if (answers.length === 1) {
      await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: interviewBody(FIRST, 1) });
      return;
    }
    await held;
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: interviewBody(SECOND, answers.length) });
  });
  return { answers, release: () => release() };
}

function answerForm(page: Page) {
  return page.locator("form").filter({ hasText: "なぜこの質問？" });
}

test("選択肢：キーボードで選択肢を押すと、その文をそのまま送り、何を送ったかが出て、送っている間は押せない", async ({ page }) => {
  const mock = await mockInterview(page);
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルで試す" }).click();
  await expect(page.getByRole("heading", { name: /^質問に答える/ })).toBeVisible();

  // 選択肢は、押すとすぐ送ることを示した組の中にある。書く欄と「回答する」も残る
  const form = answerForm(page);
  const group = form.getByRole("group", { name: "答えを選ぶと、すぐに送ります。" });
  await expect(group.getByRole("button")).toHaveText(FIRST.options);
  await expect(form.getByLabel(/^回答（/)).toBeVisible();
  await expect(form.getByRole("button", { name: "回答する" })).toBeDisabled();
  await expect(form).toContainText("選択肢にない答えや、付け足したいことは、下の欄に書いて「回答する」を押してください。");
  await expect(form).toContainText("押し間違えたときは、次の質問の回答欄に「さっきの答えは違います。正しくは…」");
  await expect(form).toContainText("最後の質問だったときは");

  // キーボードだけで：選択肢に焦点を当てて Enter
  const option = group.getByRole("button", { name: "毎日取っている" });
  await option.focus();
  await page.keyboard.press("Enter");

  // 送った文がそのまま回答として届き、何を送ったかが画面に出る（読み上げの領域と同じ所）
  const busy = page.getByText("「毎日取っている」を送りました。回答を読み取っています。");
  await expect(busy).toBeVisible();
  await expect.poll(() => mock.answers.length).toBe(2);
  expect(mock.answers[1]).toBe("毎日取っている");
  // 送っている間は、選択肢も「回答する」も出ない（二重に送らない）
  await expect(form).toHaveCount(0);
  await page.keyboard.press("Enter");

  // 返事が届くと次の質問になり、「これまでの質問と回答」に送った答えが残る
  mock.release();
  await expect(page.getByText(SECOND.text)).toBeVisible();
  await expect(busy).toBeHidden();
  const history = page.locator("details").filter({ has: page.locator("summary", { hasText: "これまでの質問と回答（1件）" }) });
  await expect(history.locator("ol > li").first()).toContainText("毎日取っている");
  expect(mock.answers).toHaveLength(2);
});

test("選択肢：続けて2回押しても（ダブルクリック）、回答は1回だけ送る", async ({ page }) => {
  const mock = await mockInterview(page);
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルで試す" }).click();
  await answerForm(page).getByRole("button", { name: "取っていない" }).dblclick();
  await expect(page.getByText("「取っていない」を送りました。")).toBeVisible();
  mock.release();
  await expect(page.getByText(SECOND.text)).toBeVisible();
  // 最初の質問を用意する1回と、回答の1回だけ
  expect(mock.answers).toEqual([undefined, "取っていない"]);
});

test("選択肢：欄に書きかけの文があるときは、選択肢を押せない（書いた文を消さない）", async ({ page }) => {
  await mockInterview(page);
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルで試す" }).click();
  const form = answerForm(page);
  const options = form.getByRole("group", { name: "答えを選ぶと、すぐに送ります。" }).getByRole("button");
  await form.getByLabel(/^回答（/).fill("書きかけ");
  for (const option of await options.all()) await expect(option).toBeDisabled();
  await expect(form).toContainText("下の欄に文があるときは、選択肢は押せません");
  await form.getByLabel(/^回答（/).fill("");
  for (const option of await options.all()) await expect(option).toBeEnabled();
});

// 問診の途中で合言葉が切れたとき。書き直せる回答は、合言葉を確かめたあとに自動では送らず、もう一度押してもらう
test("選択肢：回答のときに合言葉が要ると、欄が出て、確かめたあとは自動で送らずに案内へ焦点を移す", async ({ page }) => {
  const answers: (string | undefined)[] = [];
  await page.route("**/api/interview", async (route) => {
    answers.push((route.request().postDataJSON() as { answer?: string }).answer);
    await route.fulfill(
      answers.length === 1
        ? { status: 200, contentType: "application/x-ndjson", body: interviewBody(FIRST, 1) }
        : {
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ error: "合言葉の確認が、まだ終わっていません。すぐ下の欄に合言葉を入れて「確かめる」を押してください。" }),
          },
    );
  });
  await page.route("**/api/access", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルで試す" }).click();
  await answerForm(page).getByRole("button", { name: "わからない" }).click();

  const codeForm = page.getByRole("form", { name: "合言葉の確認" });
  await expect(codeForm.getByLabel(/^合言葉/)).toBeFocused();
  await codeForm.getByLabel(/^合言葉/).fill("せいかい");
  await codeForm.getByRole("button", { name: "合言葉を確かめる" }).click();
  const notice = page.getByText("合言葉を確かめました。先ほど押したボタンを、もう一度押してください。");
  await expect(notice).toBeFocused();
  // 自動では送らない（最初の質問の1回と、止まった回答の1回だけ）。質問と選択肢は残っていて、押し直せる
  expect(answers).toEqual([undefined, "わからない"]);
  await expect(answerForm(page).getByRole("button", { name: "わからない" })).toBeVisible();
});

test("選択肢：選択肢にない答えは、欄に書いて「回答する」で送れる", async ({ page }) => {
  const mock = await mockInterview(page);
  await page.goto("/");
  await page.getByRole("button", { name: "サンプルで試す" }).click();
  const form = answerForm(page);
  await form.getByLabel(/^回答（/).fill("週に1回、外付けの機器に取っています");
  await form.getByRole("button", { name: "回答する" }).click();
  await expect(page.getByText("「週に1回、外付けの機器に取っています」を送りました。")).toBeVisible();
  await expect.poll(() => mock.answers.length).toBe(2);
  expect(mock.answers[1]).toBe("週に1回、外付けの機器に取っています");
  mock.release();
  await expect(page.getByText(SECOND.text)).toBeVisible();
});
