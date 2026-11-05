// デモ動画を無音で録る。Playwright の素の API（playwright/test ではない）で画面を操作し、
// 動画（webm）、場面ごとの時刻（scenes.json、scenes.md）、要所の画像（shots/）を出力先に残す。
// 実際の Claude を呼ぶので、1回の通しで費用がかかる（11/6 の試しの録画は、単価からの計算で約 $0.23）。
//
// 使い方（本番ビルドを手元で起こしてから。合言葉はシェルの環境変数で渡し、画面には映さない）：
//   DEMO_ACCESS_CODE=… DEMO_XLSX=/絶対パス/架空の記入例_医療機関確認用.xlsx npm run demo:record
//
// 環境変数：
//   DEMO_BASE_URL   動かしているサーバー（既定 http://localhost:3102）
//   DEMO_ACCESS_CODE 合言葉。録画を始める前に、画面の外（context.request）で /api/access に送って cookie を付ける
//   DEMO_XLSX       去年のチェックリスト（医療機関用）の Excel の絶対パス
//   DEMO_OUT        出力先（既定 demo/out/<日時>/）
//   DEMO_FREE_ONLY=1 Claude を呼ばない場面だけを通す（入口、Excel、架空の保存ファイルの読み込み、保存、説明用の1枚）。
//                   部品の取り方を直したときに、費用をかけずに確かめる
//   DEMO_WARMUP=1   録画の前にサーバーを温める。録画とは別のコンテキストで「サンプルで試す」を押し、最初の質問が出るまで待って閉じる。
//                   起動直後の1回目は最初の質問に 13秒かかった（2026-11-06 の録画。2回目以降は 2〜3秒）ので、本番の録画の前に使う。
//                   Claude を1回呼ぶので費用がかかる（最初の質問の用意は、入力 約1,200、出力 約300、キャッシュ書き 約2,300 トークン。
//                   fast mode の単価で 約 $0.04）
//
// 場面の順は docs/demo-script.md の台本に合わせる。画面の文は毎回少し変わるので、文を決め打ちせず、見出しや role で待つ。
// 部品の取り方（role と name）は e2e/*.spec.ts と同じにする

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { CASES } from "../../eval/cases.ts";

const BASE_URL = process.env.DEMO_BASE_URL ?? "http://localhost:3102";
const ACCESS_CODE = process.env.DEMO_ACCESS_CODE ?? "";
const XLSX = process.env.DEMO_XLSX;
const FREE_ONLY = process.env.DEMO_FREE_ONLY === "1";
const WARMUP = process.env.DEMO_WARMUP === "1";
const OUT = path.resolve(process.env.DEMO_OUT ?? path.join("demo", "out", stamp()));
const SHOTS_DIR = path.join(OUT, "shots");
// 動画と画面の大きさ（同じにする）
const SIZE = { width: 1280, height: 800 };
// Claude の返答を待つ上限。画面の通信の上限（src/lib/wait.ts の 90秒）より長くしておく
const CLAUDE_TIMEOUT = 120_000;
// Claude を呼ばない通しで使う、架空の保存ファイル（e2e と同じもの）
const FIXTURE = path.resolve("e2e/fixtures/saved-result-v1.json");

// 「戻したことがない」「戻せるか確かめていない」の意味の選択肢。あればそれを選ぶ
const RESTORE_NEGATIVE = /戻(し|せ)[^、。]*(ない|いない|ありません)|確かめていない|試していない|したことがない/;
// 選択肢になかったときに回答欄に入れる文
const RESTORE_ANSWER = "バックアップは毎晩ベンダーの機械が取っています。戻す練習はしたことがありません。";
// 「わからない」の意味の選択肢。戻す話の次の質問（ふつうは3問目、切り離し）で選ぶ
const UNKNOWN_OPTION = /わからない|分からない|不明/;
// 問診で答える回数の上限（ふつうは 2〜4問で終わる）
const MAX_ANSWERS = 8;
// ベンダーの返事：評価ケースの「偽の指示を含む返事」
const REPLY = CASES.find((testCase) => testCase.id === "fake_instruction")?.vendor?.reply;
if (!REPLY) throw new Error("eval/cases.ts に fake_instruction の返事がありません");

type Wait = { startMs: number; endMs: number; what: string };
type Scene = { no: number; name: string; startMs: number; endMs: number | null; waits: Wait[]; shots: string[]; notes: string[] };

function stamp(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}

// 時刻はすべて、コンテキストを作った時刻からのミリ秒
let t0 = 0;
const now = () => Date.now() - t0;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}秒`;

const scenes: Scene[] = [];
let current: Scene | null = null;
let shotNo = 0;

function scene(no: number, name: string) {
  if (current) current.endMs = now();
  current = { no, name, startMs: now(), endMs: null, waits: [], shots: [], notes: [] };
  scenes.push(current);
  console.log(`[demo] 場面${no} ${name}（${sec(current.startMs)}）`);
}

function note(text: string) {
  current?.notes.push(text);
  console.log(`[demo] ${text}`);
}

// Claude の返答などを待つ区間を記録する（編集で縮めるのに使う）
async function waiting<T>(what: string, run: () => Promise<T>): Promise<T> {
  const startMs = now();
  try {
    return await run();
  } finally {
    const endMs = now();
    current?.waits.push({ startMs, endMs, what });
    console.log(`[demo]   待ち：${what} ${sec(endMs - startMs)}`);
  }
}

// 要所の画像（見えている範囲、1280×800）
async function shot(page: Page, name: string) {
  shotNo += 1;
  const file = `${String(shotNo).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: path.join(SHOTS_DIR, file) });
  current?.shots.push(file);
}

// 見る人が読めるよう、要所で止める
async function pause(page: Page, ms: number) {
  await page.waitForTimeout(ms);
}

// 部品を見えている範囲に入れる。すでに入っていれば動かさない。動かすときはなめらかに動かし、止まるまで待つ
async function show(locator: Locator, block: ScrollLogicalPosition = "center") {
  const target = locator.first();
  await target.waitFor({ state: "visible" });
  const moved = await target.evaluate((element, position) => {
    const rect = element.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return false;
    element.scrollIntoView({ behavior: "smooth", block: position });
    return true;
  }, block);
  if (moved) await target.page().waitForTimeout(900);
}

// 合言葉：画面の外で /api/access に送り、cookie を付ける。本番では合言葉がないと API に届かない（src/proxy.ts）。
// proxy は same-origin の印（sec-fetch-site）を見るので、同じ印を付けて送る
async function grantAccess(context: BrowserContext): Promise<string> {
  if (!ACCESS_CODE) return "合言葉なし（DEMO_ACCESS_CODE が空）";
  const response = await context.request.post(`${BASE_URL}/api/access`, {
    data: { code: ACCESS_CODE },
    headers: { "sec-fetch-site": "same-origin" },
  });
  if (!response.ok()) throw new Error(`合言葉の確認に失敗しました（${response.status()}）`);
  return "画面の外（context.request）で /api/access に送り、cookie を付けた";
}

// 問診の1問に、どう答えるか。1問目は選択肢の最初（取っている）。
// そのあとは「戻したことがない」の意味の選択肢があれば選び、なければ、戻す話の質問か3問目で回答欄に文を入れる。
// 戻す話を答えた次の質問（ふつうは3問目、切り離し）は「わからない」の意味の選択肢を選ぶ（なければ最初の選択肢）。
// 止まる穴が「戻す確認」と「切り離し」の2件になり、次にすること（6件）と返事待ち（2件）が厚くなるため。
// それより後は、選択肢の最初を選ぶ
type Progress = { restoreDone: boolean; unknownDone: boolean };
function decide(n: number, questionText: string, options: string[], progress: Progress): { kind: "option" | "text"; text: string } {
  if (options.length === 0) return { kind: "text", text: progress.restoreDone ? "わかりません。" : RESTORE_ANSWER };
  if (n === 1) return { kind: "option", text: options[0] };
  if (progress.restoreDone) {
    if (progress.unknownDone) return { kind: "option", text: options[0] };
    return { kind: "option", text: options.find((option) => UNKNOWN_OPTION.test(option)) ?? options[0] };
  }
  const negative = options.find((option) => RESTORE_NEGATIVE.test(option));
  if (negative) return { kind: "option", text: negative };
  if (/戻/.test(questionText) || n >= 3) return { kind: "text", text: RESTORE_ANSWER };
  return { kind: "option", text: options[0] };
}

// 録画の前にサーバーを温める（DEMO_WARMUP=1）。録画とは別のコンテキストなので動画には入らない。cookie は録画と同じ方法で付ける。
// Claude を1回呼ぶ（費用の目安は冒頭のコメント）
async function warmUp(browser: Browser): Promise<number> {
  const context = await browser.newContext({ viewport: SIZE, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
  try {
    await grantAccess(context);
    const page = await context.newPage();
    await page.goto(BASE_URL);
    await page.getByRole("button", { name: "サンプルで試す" }).click();
    const startedAt = Date.now();
    await page.getByRole("heading", { name: /^質問に答える/ }).waitFor({ timeout: CLAUDE_TIMEOUT });
    const ms = Date.now() - startedAt;
    console.log(`[demo] 温め：最初の質問まで ${sec(ms)}`);
    return ms;
  } finally {
    await context.close();
  }
}

function verdictLabel(page: Page) {
  return page.locator("#verdict-label");
}

function summaryHeading(page: Page) {
  return page.getByRole("heading", { name: "問診のまとめ" });
}

function holesRegion(page: Page) {
  return page.getByRole("region", { name: "診療が止まるおそれがあるところと次にすること" });
}

// 場面1：入口
async function sceneEntry(page: Page) {
  scene(1, "入口");
  await page.goto(BASE_URL);
  await page.getByRole("heading", { level: 1, name: "病院のサイバー問診アシスタント" }).waitFor();
  await pause(page, 3000);
  await shot(page, "entry");
}

// 場面2：Excel を読み込み、5項目の一覧を見せ、「バックアップと復旧」の行を選ぶ
async function sceneExcel(page: Page) {
  scene(2, "Excel の読み込み");
  if (!XLSX) throw new Error("DEMO_XLSX に、去年のチェックリスト（医療機関用）の Excel の絶対パスを入れてください");
  await page.getByLabel("Excel を読み込む").setInputFiles(XLSX);
  const table = page.getByRole("table", { name: "去年の回答の一覧（重点項目5つ）" });
  await table.waitFor();
  // 一覧が出た直後に止めてから、一覧の先頭へ動かす
  await pause(page, 1500);
  await show(table, "start");
  await pause(page, 3000);
  await shot(page, "excel-list");
  const rows = table.getByRole("row").filter({ has: page.getByRole("button", { name: /この対策を選ぶ/ }) });
  const chooseBackup = rows.getByRole("button", { name: /^この対策を選ぶ\s*（バックアップと復旧）$/ });
  await show(chooseBackup);
  await pause(page, 1200);
  await chooseBackup.click();
  await page.getByText("バックアップと復旧（3-②）の去年の回答を読み取りました。").first().waitFor();
  const startButton = page.getByRole("button", { name: "この回答で問診を始める" });
  await show(startButton);
  await pause(page, 2000);
  return startButton;
}

// 場面3：問診。選択肢で答え、判定カードが「はい（書類上だけ）」に変わる瞬間を映す
async function sceneInterview(page: Page, startButton: Locator) {
  scene(3, "問診");
  const questionHeading = page.getByRole("heading", { name: /^質問に答える/ });
  await startButton.click();
  await waiting("最初の質問を用意", () => questionHeading.waitFor({ timeout: CLAUDE_TIMEOUT }));

  const progress: Progress = { restoreDone: false, unknownDone: false };
  let paperOnlyShown = false;
  for (let n = 1; n <= MAX_ANSWERS; n++) {
    if (await summaryHeading(page).isVisible()) break;
    const form = page.locator("form").filter({ hasText: "なぜこの質問？" });
    await form.waitFor();
    const questionText = (await form.locator("p").first().textContent()) ?? "";
    await show(questionHeading, "start");
    await pause(page, 2500);

    const group = form.getByRole("group", { name: "答えを選ぶと、すぐに送ります。" });
    const options = (await group.count()) > 0 ? await group.getByRole("button").allTextContents() : [];
    const choice = decide(n, questionText, options, progress);
    // 戻す話を答えたあとの最初の質問（「わからない」を選ぶ番）が済んだら印を付け、そのあとで戻す話の印を付ける（順番を変えない）
    if (progress.restoreDone) progress.unknownDone = true;
    if (choice.text === RESTORE_ANSWER || RESTORE_NEGATIVE.test(choice.text)) progress.restoreDone = true;
    note(`${n}問目：${choice.kind === "option" ? "選択肢" : "回答欄"}「${choice.text}」`);
    if (choice.kind === "option") {
      const button = group.getByRole("button", { name: choice.text, exact: true });
      await show(button);
      await pause(page, 800);
      await button.click();
    } else {
      const field = form.getByLabel(/^回答（/);
      await show(field);
      await field.click();
      await field.pressSequentially(choice.text, { delay: 25 });
      await pause(page, 800);
      await form.getByRole("button", { name: "回答する" }).click();
    }

    // 読み取りが届くまで待つ。「続ける」で区切られたときは押して続ける
    const continueButton = page.getByRole("button", { name: "続ける", exact: true });
    await waiting(`${n}問目の回答の読み取り`, async () => {
      const busy = page.getByText("回答を読み取っています");
      await busy.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
      await busy.waitFor({ state: "hidden", timeout: CLAUDE_TIMEOUT });
      for (let i = 0; i < 3; i++) {
        await questionHeading.or(summaryHeading(page)).or(continueButton).first().waitFor({ timeout: CLAUDE_TIMEOUT });
        if (!(await continueButton.isVisible())) break;
        note(`${n}問目のあとに「続ける」が出たので押した`);
        await continueButton.click();
        await page.getByText("続きを確かめています").waitFor({ state: "hidden", timeout: CLAUDE_TIMEOUT });
      }
    });
    const alert = page.getByRole("main").getByRole("alert");
    if ((await alert.count()) > 0) note(`エラーの文：${(await alert.first().textContent())?.trim()}`);

    // 読み取りが届いた直後に止める。判定が「はい（書類上だけ）」に変わっていれば、変わった直後の画像を残す
    const verdict = (await verdictLabel(page).textContent())?.trim();
    if (!paperOnlyShown && verdict === "はい（書類上だけ）") {
      await show(verdictLabel(page));
      await shot(page, "verdict-paper-only");
      note(`${n}問目の回答で、判定が「はい（書類上だけ）」に変わった`);
      paperOnlyShown = true;
    }
    await pause(page, 2000);
    const recent = page.getByRole("region", { name: "直前の回答から読み取ったこと" });
    if (await recent.isVisible()) {
      await show(recent, "start");
      await pause(page, 2000);
    }
  }
  if (!(await summaryHeading(page).isVisible())) throw new Error(`${MAX_ANSWERS}問答えても問診のまとめが出ませんでした`);
  if (!paperOnlyShown) note("問診の中で判定が「はい（書類上だけ）」にならなかった");
}

// 場面4：問診のまとめ、止まる穴トップ3、「まず、これから」、次にすること
async function sceneSummary(page: Page) {
  scene(4, "問診のまとめと次にすること");
  await show(summaryHeading(page), "start");
  await pause(page, 3000);
  await shot(page, "summary");
  const holes = holesRegion(page);
  await show(holes.getByRole("heading", { name: "このままだと診療が止まるおそれがあるところ" }), "start");
  await pause(page, 3000);
  const first = holes.getByRole("heading", { level: 3, name: "まず、これから" });
  if ((await first.count()) > 0) {
    await show(first);
    await pause(page, 1500);
  }
  await shot(page, "holes-first-step");
  await pause(page, 1500);
  const steps = holes.getByRole("heading", { name: "次にすること" });
  await show(steps, "start");
  await pause(page, 2000);
  // 「やった」の印を1つ付ける（「まず、これから」が次の1件に変わる）
  const box = holes.getByRole("checkbox").first();
  if ((await box.count()) > 0) {
    await show(box);
    await box.check();
    await pause(page, 2000);
  }
}

// 場面5：ベンダーへの質問文を見せ、結果を保存する
async function sceneVendorQuestion(page: Page): Promise<string> {
  scene(5, "ベンダーへの質問文と保存");
  const heading = page.getByRole("heading", { name: "1. ベンダーに質問文を送る" });
  if ((await heading.count()) > 0) {
    await show(heading, "start");
    await pause(page, 3500);
    await shot(page, "vendor-question");
  } else {
    note("ベンダーへの質問文が出なかった（止まる穴がない）");
  }
  const saveButton = page.getByRole("button", { name: "続きを再開するためのファイルを保存する", exact: true });
  await show(saveButton);
  await pause(page, 800);
  const [download] = await Promise.all([page.waitForEvent("download"), saveButton.click()]);
  const savedPath = path.join(OUT, "saved-result.json");
  await download.saveAs(savedPath);
  note(`保存したファイル：${download.suggestedFilename()} → saved-result.json`);
  // 保存は画面に変化がないので、ボタンの下の「病院名と、これまでの質問と回答の文は入りません」の段落を見せる
  await show(page.getByText(/^保存するファイルは、このアプリにもう一度読み込んで/));
  await pause(page, 2500);
  return savedPath;
}

// 場面6：保存したファイルを読み込み、返事を貼って確かめる。偽の指示が紛れた返事でも判定は変わらない
async function sceneReply(page: Page, savedPath: string) {
  scene(6, "保存した結果の読み込みと返事の確認");
  await page.goto(BASE_URL);
  await page.getByLabel("続きを再開するためのファイルを読み込む").setInputFiles(savedPath);
  await waiting("保存ファイルの確認", () => summaryHeading(page).waitFor({ timeout: 30_000 }));
  await pause(page, 1500);
  await show(page.getByRole("heading", { name: "3. 返事が届いたら、貼り付けて確かめる" }), "start");
  const field = page.getByLabel(/^返事（/);
  await field.fill(REPLY!);
  await pause(page, 3000);
  if (FREE_ONLY) {
    note("Claude を呼ばない通しなので、「返事を確かめる」は押さない");
    return;
  }
  const verifyButton = page.getByRole("button", { name: "返事を確かめる" });
  await show(verifyButton);
  await verifyButton.click();
  const resultsHeading = page.getByRole("heading", { name: "返事を読み取った結果" });
  await waiting("返事の読み取り", () => resultsHeading.waitFor({ timeout: CLAUDE_TIMEOUT }));
  const alert = page.getByRole("main").getByRole("alert");
  if ((await alert.count()) > 0) note(`エラーの文：${(await alert.first().textContent())?.trim()}`);
  await show(resultsHeading, "start");
  await pause(page, 1500);
  const box = page.getByRole("status", { name: "返事の中の、AI への指示のように読める文" });
  if ((await box.count()) > 0) {
    await show(box);
    await pause(page, 3000);
  } else {
    note("「AI への指示のように読める文」の箱が出なかった");
  }
  // 1280×800 では、箱と判定カードが同じ画面に入るので、画像は1枚でよい
  await shot(page, "reply-result-injection");
  const changes = page.getByRole("region", { name: "返事で変わったこと" });
  await show(changes);
  await pause(page, 2500);
  await show(verdictLabel(page));
  await pause(page, 1500);
}

// 場面7：説明用の1枚。印刷の表示に切り替えて見せる（印刷ダイアログは出さない）。
// 1枚は印刷用（A4、10pt）なので、1280 の幅では字が小さい。動画で読めるよう、紙の幅に近づけて大きく映す（中身は変えない）
async function scenePrintSheet(page: Page) {
  scene(7, "説明用の1枚");
  // 何の画面かが伝わるよう、切り替える前に「説明用の1枚を印刷する」のボタンに視線を置く（押さない。印刷ダイアログは出さない）
  const printButton = page.getByRole("button", { name: "説明用の1枚を印刷する" });
  await show(printButton);
  await printButton.hover();
  await pause(page, 1000);
  await page.emulateMedia({ media: "print" });
  await page.addStyleTag({ content: "#print-sheet { max-width: 920px; margin: 0 auto; zoom: 1.3; }" });
  const sheet = page.locator("#print-sheet");
  await sheet.waitFor({ state: "visible" });
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await pause(page, 600);
  await shot(page, "print-sheet");
  await pause(page, 3000);
  // 1枚が画面より長ければ、下のほうも見せる
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (overflow > 40) {
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
    await pause(page, 3000);
    await shot(page, "print-sheet-bottom");
  }
  await page.emulateMedia({ media: "screen" });
}

// 場面8：最後に止めて終わる
async function sceneEnd(page: Page) {
  scene(8, "終わり");
  await pause(page, 2000);
  if (current) current.endMs = now();
}

function writeScenes(meta: { startedAt: string; videoStartMs: number; access: string; warmupMs: number | null; error?: string }) {
  const totalMs = scenes.at(-1)?.endMs ?? now();
  const waits = scenes.flatMap((item) => item.waits.map((wait) => ({ scene: item.no, ...wait })));
  const totalWaitMs = waits.reduce((sum, wait) => sum + (wait.endMs - wait.startMs), 0);
  const json = {
    startedAt: meta.startedAt,
    baseUrl: BASE_URL,
    video: { file: "demo.webm", width: SIZE.width, height: SIZE.height },
    timeOrigin: "コンテキストを作った時刻を 0 とするミリ秒",
    videoStartMs: meta.videoStartMs,
    access: meta.access,
    freeOnly: FREE_ONLY,
    warmupMs: meta.warmupMs,
    totalMs,
    totalWaitMs,
    error: meta.error ?? null,
    scenes,
  };
  writeFileSync(path.join(OUT, "scenes.json"), JSON.stringify(json, null, 2));

  const lines = [
    `# デモ動画の場面（${meta.startedAt}）`,
    "",
    `- 動画：demo.webm（${SIZE.width}×${SIZE.height}、全体 ${sec(totalMs)}）`,
    `- 時刻は、コンテキストを作った時刻を 0 とするミリ秒。ページを開いたのは +${meta.videoStartMs}ms`,
    `- Claude などを待った区間の合計：${sec(totalWaitMs)}（編集で縮める）`,
    `- 合言葉：${meta.access}`,
    meta.warmupMs !== null ? `- 録画の前にサーバーを温めた（最初の質問まで ${sec(meta.warmupMs)}。動画には入らない）` : "",
    FREE_ONLY ? "- Claude を呼ばない通し（問診と返事の確認は飛ばした）" : "",
    meta.error ? `- 途中で止まった：${meta.error}` : "",
    "",
    "| 場面 | 名前 | 開始 | 終了 | 長さ | 待ち | 画像 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...scenes.map((item) => {
      const endMs = item.endMs ?? totalMs;
      const waitMs = item.waits.reduce((sum, wait) => sum + (wait.endMs - wait.startMs), 0);
      return `| ${item.no} | ${item.name} | ${sec(item.startMs)} | ${sec(endMs)} | ${sec(endMs - item.startMs)} | ${sec(waitMs)} | ${item.shots.join("、") || "―"} |`;
    }),
    "",
    "## 待っていた区間",
    "",
    "| 場面 | 何を待ったか | 開始 | 終了 | 長さ |",
    "| --- | --- | --- | --- | --- |",
    ...waits.map((wait) => `| ${wait.scene} | ${wait.what} | ${sec(wait.startMs)} | ${sec(wait.endMs)} | ${sec(wait.endMs - wait.startMs)} |`),
    "",
    "## 記録",
    "",
    ...scenes.flatMap((item) => item.notes.map((text) => `- 場面${item.no}：${text}`)),
    "",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  writeFileSync(path.join(OUT, "scenes.md"), lines.join("\n"));
}

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });
  console.log(`[demo] 出力先：${OUT}`);
  const browser = await chromium.launch();
  // 温めは録画の前に済ませる（時刻の 0 は、このあとの録画のコンテキストを作った時刻）
  let warmupMs: number | null = null;
  if (WARMUP && FREE_ONLY) console.log("[demo] Claude を呼ばない通しなので、温めはしない");
  else if (WARMUP) warmupMs = await warmUp(browser);
  t0 = Date.now();
  const startedAt = new Date(t0).toISOString();
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: OUT, size: SIZE },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  let access = "";
  let page: Page | null = null;
  let videoStartMs = 0;
  let error: string | undefined;
  try {
    access = await grantAccess(context);
    page = await context.newPage();
    videoStartMs = now();
    page.setDefaultTimeout(30_000);

    await sceneEntry(page);
    const startButton = await sceneExcel(page);
    let savedPath: string;
    if (FREE_ONLY) {
      // 問診は飛ばし、架空の保存ファイルで結果の画面を出す
      scene(3, "問診（飛ばす）");
      await page.goto(BASE_URL);
      await page.getByLabel("続きを再開するためのファイルを読み込む").setInputFiles(FIXTURE);
      await waiting("架空の保存ファイルの確認", () => summaryHeading(page!).waitFor({ timeout: 30_000 }));
      await sceneSummary(page);
      savedPath = await sceneVendorQuestion(page);
    } else {
      await sceneInterview(page, startButton);
      await sceneSummary(page);
      savedPath = await sceneVendorQuestion(page);
    }
    await sceneReply(page, savedPath);
    await scenePrintSheet(page);
    await sceneEnd(page);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    console.error(`[demo] 失敗：${error}`);
    if (page) await shot(page, "error").catch(() => {});
    if (current) current.endMs = now();
  }
  const video = page?.video() ?? null;
  await context.close();
  if (video) {
    await video.saveAs(path.join(OUT, "demo.webm"));
    await video.delete();
  }
  await browser.close();
  writeScenes({ startedAt, videoStartMs, access, warmupMs, error });
  console.log(`[demo] 動画：${path.join(OUT, "demo.webm")}`);
  if (error) process.exit(1);
}

await main();
