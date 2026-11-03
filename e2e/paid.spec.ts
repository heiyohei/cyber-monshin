import { expect, test } from "playwright/test";
import { CASES } from "../eval/cases";
import { expectVerdictComputedFromCard, loadSavedResult, STATUS_WORDS, verdictCard } from "./helpers";

// 実際の Claude を呼ぶので費用がかかる。E2E_PAID=1 のときだけ動く（npm run test:e2e:paid）。
// 質問や回答の文は毎回少し変わるので、中身は決め打ちせず、画面の形と、判定がコードの計算と一致することだけを確かめる
const VIEWPOINT_NAMES = ["取得", "戻す確認", "切り離し", "手順"];
const RESULT_WORDS = ["満たす", "満たさない", "曖昧", "回答なし"];
const STATUS_PATTERN = `(${STATUS_WORDS.join("|")})`;

test.describe("@paid 実際の Claude を呼ぶ", () => {
  test.skip(process.env.E2E_PAID !== "1", "費用がかかるので、E2E_PAID=1 のときだけ動かします");
  test.describe.configure({ timeout: 180_000 });

  test("問診：サンプルで始めて1問答えると、判定カードの4つの観点に状態の言葉が出る", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "サンプルで試す" }).click();

    // 最初の質問（最大 90 秒待つ）
    await expect(page.getByRole("heading", { name: /^質問に答える/ })).toBeVisible({ timeout: 90_000 });
    const form = page.locator("form").filter({ hasText: "なぜこの質問？" });
    await expect(form.getByRole("button", { name: "回答する" })).toBeDisabled();

    // 選択肢を1つ押すと回答欄に入るだけで、まだ送られない
    const options = form.locator('button[type="button"]');
    await expect(options.first()).toBeVisible();
    await options.first().click();
    await expect(form.getByText("選択肢を回答欄に入れました。まだ送っていません。")).toBeVisible();
    await expect(form.getByLabel(/^回答（/)).not.toHaveValue("");

    // 「回答する」で送る。読み取りの間の案内が消えるまで待つ
    await form.getByRole("button", { name: "回答する" }).click();
    const busy = page.getByText("回答を読み取っています");
    await expect(busy).toBeVisible();
    await expect(busy).toBeHidden({ timeout: 120_000 });
    // エラーの文（role=alert）が出ていない。Next.js の開発ツールにも空の alert があるので、画面の中だけを見る
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

    // 次の質問か、まとめが出る
    await expect(page.getByRole("heading", { name: /^質問に答える|^問診のまとめ$/ })).toBeVisible();

    // 判定カードの観点は4つ。状態は決まった言葉のどれか
    const card = verdictCard(page);
    for (const name of VIEWPOINT_NAMES) {
      await expect(card.getByText(new RegExp(`^${name}：${STATUS_PATTERN}$`))).toBeVisible();
    }
    // 判定は、Claude が報告した観点の状態から、コードが計算したものになっている
    const states = await expectVerdictComputedFromCard(page);
    // 1問答えたので、少なくとも1つの観点は回答から読み取られている
    expect(Object.values(states).some((status) => status !== "not_asked")).toBe(true);
  });

  test("返事の読み解き：保存ファイルを読み込み、返事を貼ると、要件ごとの読み取りが出る", async ({ page }) => {
    // 評価ケースの「十分な返事」を貼る
    const reply = CASES.find((testCase) => testCase.id === "restore_unknown")?.vendor?.reply;
    expect(reply).toBeTruthy();

    await loadSavedResult(page);
    await page.getByLabel(/^返事（/).fill(reply!);
    await page.getByRole("button", { name: "返事を確かめる" }).click();

    await expect(page.getByRole("heading", { name: "返事を読み取った結果" })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

    // 保存ファイルの要件は2つ。それぞれに、答えているか（満たす／満たさない／曖昧／回答なし）が出る
    const results = page.getByText(new RegExp(`：(${RESULT_WORDS.join("|")})$`));
    await expect(results).toHaveCount(2);
    await expect(page.getByRole("region", { name: "返事で変わったこと" })).toBeVisible();

    // 判定カードの観点は4つのまま。返事で決まった観点は出どころが「ベンダーの返事から」になる
    const card = verdictCard(page);
    for (const name of VIEWPOINT_NAMES) {
      await expect(card.getByText(new RegExp(`^${name}：${STATUS_PATTERN}$`))).toBeVisible();
    }
    // 返事のあとの判定も、観点の状態からコードが計算したものになっている
    await expectVerdictComputedFromCard(page);
  });
});
