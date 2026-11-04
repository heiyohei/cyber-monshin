import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator } from "playwright/test";
import { loadSavedResult, saveScreenshot } from "./helpers";

// 担当の引き継ぎ：次にすることの「やった」印と、説明用の1枚の「引き継ぐこと」。Claude は呼ばない。
// 架空の保存ファイル（版1）は、切り離し（できていない）と戻す確認（わからない）の2つが穴なので、次にすることは 2×3 = 6件。
// 照合する文は src/data/backup.ts の固定データと、e2e/fixtures/saved-result-v1.json の値
const RESULTS_DIR = path.join(__dirname, "results");
const HOLES_REGION = "診療が止まるおそれがあるところと次にすること";
// A4（297mm）から上下の余白（15mm ずつ、src/app/globals.css の @page）を引いた高さ。96dpi で 267mm ≈ 1009px。
// page.pdf は preferCSSPageSize で @page の大きさと余白を使う（margin の指定はないので CSS の 15mm）。
// 実測では、この余白の空のページで 1010px の箱は1ページ、1012px の箱は2ページになった
const PRINTABLE_HEIGHT_PX = (267 / 25.4) * 96;
// A4 の幅（210mm）から左右の余白を引いた幅。1枚に収まるかは、この幅で測る
const PRINTABLE_WIDTH_PX = Math.round((180 / 25.4) * 96);

// 印刷の切れ目を画面で再現するための指定。印刷の表示（emulateMedia）では1枚の中身が縦に続くだけで、改ページの指定
// （break-inside-avoid など）は PDF にするときにしか効かない。Chromium は多段組み（CSS columns）でも印刷と同じ仕組みで
// 中身を分けるので、1段を紙の印刷できる幅と高さ（180mm × 267mm）にして3段並べ、何段目（＝何枚目）にあるかを測る。
// 3段あれば、3枚目にはみ出したことも分かる
const PAGE_EMULATION_STYLE =
  "column-width:180mm;column-gap:20mm;column-fill:auto;height:267mm;width:calc(180mm * 3 + 20mm * 2);max-width:none";

// 見出し、段落、箇条書きの項目と、途中で切れないようにした入れ物（break-inside-avoid）
type PrintBox = {
  tag: string;
  text: string;
  page: number; // 0 が1枚目
  top: number; // その枚の上端からの位置（px）
  bottom: number;
  split: boolean; // 枚をまたいで途中で切れている
  keepWithNext: boolean; // break-after: avoid（見出し。直後の中身と離さない）
};
// それ以外の入れ物（ul、ol、改ページの指定がない div）。中の見出しや項目が2枚にまたがる入れ物は、段ごとの箱も2つに分かれるはずなので、
// 「途中で切れている」の判定が本当に働いていることを、これで照らす
type PrintContainer = { tag: string; text: string; split: boolean; spansPages: boolean };
type PrintLayout = { boxes: PrintBox[]; containers: PrintContainer[] };

// 1枚の入れ物に段組みの指定を付ける（off で元に戻す）。付けたまま撮ると、1枚目と2枚目が横に並んだ画像になる
async function emulatePrintPages(sheet: Locator, on: boolean) {
  await sheet.evaluate((element, style) => {
    element.style.cssText = style;
  }, on ? PAGE_EMULATION_STYLE : "");
}

// 段組みの表示で、見出し、段落、箇条書きの項目、途中で切れないようにした入れ物が、どの枚にあるか、途中で切れていないかを取る
async function readPrintLayout(sheet: Locator): Promise<PrintLayout> {
  return sheet.evaluate((element) => {
    const origin = element.getBoundingClientRect();
    const mm = origin.height / 267;
    const stride = 200 * mm; // 段の幅 180mm ＋ 段の間 20mm
    const pageOf = (node: Element) => Math.floor((node.getBoundingClientRect().left - origin.left + 1) / stride);
    // 枚をまたぐ要素は、段ごとの箱が2つ以上になる
    const isSplit = (node: Element) => node.getClientRects().length > 1;
    const LEAF_TAGS = ["H1", "H2", "H3", "P", "LI"];
    const boxes: PrintBox[] = [];
    const containers: PrintContainer[] = [];
    for (const node of element.querySelectorAll("*")) {
      const computed = getComputedStyle(node);
      const text = (node.textContent ?? "").trim().slice(0, 24);
      if (LEAF_TAGS.includes(node.tagName) || computed.breakInside === "avoid") {
        const rect = node.getBoundingClientRect();
        boxes.push({
          tag: node.tagName,
          text,
          page: pageOf(node),
          top: rect.top - origin.top,
          bottom: rect.bottom - origin.top,
          split: isSplit(node),
          keepWithNext: computed.breakAfter === "avoid",
        });
      } else {
        const pages = new Set([...node.querySelectorAll(LEAF_TAGS.join(","))].map(pageOf));
        containers.push({ tag: node.tagName, text, split: isSplit(node), spansPages: pages.size > 1 });
      }
    }
    return { boxes, containers };
  });
}

// 枚をまたいで途中で切れている要素がなく、見出しが直後の中身と同じ枚にあり、枚数が上限以内であることを確かめる。
// 2枚目があれば、その先頭は節の見出し（h2）、分類の小見出し（h3）、箇条書きの項目（li）のどれか
function expectCleanPageBreaks({ boxes, containers }: PrintLayout, maxPages: number) {
  const label = (box: { tag: string; text: string }) => `${box.tag}「${box.text}」`;
  expect(boxes.length).toBeGreaterThan(0);
  // 「途中で切れている」の判定が働いていること：中身が2枚にまたがる入れ物は2つに分かれ、またがらない入れ物は分かれない
  for (const container of containers) expect(container.split, `${label(container)} の入れ物の分かれ方`).toBe(container.spansPages);
  // 見出しの改ページの指定が CSS で効いていること（class が落ちていない）
  expect(boxes.filter((box) => box.tag === "H2" || box.tag === "H3").map((box) => box.keepWithNext)).not.toContain(false);
  expect(boxes.filter((box) => box.split).map(label), "枚をまたいで途中で切れている").toEqual([]);
  const pages = Math.max(...boxes.map((box) => box.page)) + 1;
  expect(pages, "枚数").toBeLessThanOrEqual(maxPages);
  boxes.forEach((box, index) => {
    const next = boxes[index + 1];
    if (box.keepWithNext && next) expect(next.page, `${label(box)} の直後の ${label(next)} が別の枚にある`).toBe(box.page);
  });
  const secondPageFirst = boxes.find((box) => box.page === 1 && box.tag !== "DIV");
  if (secondPageFirst) expect(["H2", "H3", "LI"], `2枚目の先頭 ${label(secondPageFirst)}`).toContain(secondPageFirst.tag);
  return { pages, secondPageFirst };
}

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
  await expect(holes.getByText(/「やった」の印を残すには、ファイルを保存してください/)).toBeVisible();
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
  // 保存したあとは、保存し直しの案内が消え、押したボタンも消えるので、焦点は「次にすること」の見出しへ戻る
  await expect(holes.getByText(/「やった」の印を残すには/)).toHaveCount(0);
  await expect(holes.getByRole("heading", { name: "次にすること" })).toBeFocused();

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
  // 「次にすること」の一覧では、印を付けたものに「済み：」が付く（紙でもどれが残りか分かる）
  await expect(sheet).toContainText("済み：バックアップを保存している機器がどこにあり、ふだんつながったままかを、院内で確かめます。");
  await expect(sheet).toContainText("済み：バックアップから戻してみたことがあるか、次はいつ試せるかを聞きます。");
  await expect(sheet.getByText(/^済み：/)).toHaveCount(2);
  await expect(sheet).toContainText("残っていること 4件（次にすること 6件のうち、済みでないもの）");
  await expect(sheet).toContainText("今日から院内でできること：最後にバックアップから戻してみた日を、作業報告や記録で探します。");
  await expect(sheet).toContainText("ベンダーに聞くこと：バックアップを、攻撃が届かない場所に分けて保管しているかを聞きます。");
  await expect(sheet).toContainText(
    "予算を立てて検討すること：ネットワークから切り離してバックアップを保管する仕組みを、次にシステムを入れ替えるときに考えます。ほか1件。",
  );
  // 架空のファイルの要件2つは、どちらも返事でまだ決まっていない（sources がすべて answer）。文は「…かどうか」の形
  await expect(sheet).toContainText("返事待ち 2件（ベンダーへの質問のうち、返事でまだ分かっていないこと）");
  await expect(sheet).toContainText("「バックアップから実際にデータを戻す試験をしたことがある」かどうか");
  await expect(sheet).toContainText("「バックアップの控えを、院内のネットワークから切り離した場所に保管している」かどうか");
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
  // 改ページの指定を付けても、ふつうの場合は1枚のまま（段組みで再現して、すべてが1枚目にある）
  await emulatePrintPages(sheet, true);
  expect(expectCleanPageBreaks(await readPrintLayout(sheet), 1).pages).toBe(pageCount);
  await emulatePrintPages(sheet, false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ media: "screen" });
  await expect(sheet).toBeHidden();
});

// 次にすることがなければ、1枚には「残っていることはありません」と出る（印を付けるものもない）
test("引き継ぎ：穴がなければ、1枚に「残っていることはありません」と出る", async ({ page }) => {
  // 架空の保存ファイルの状態をすべて「できている（回答から）」にした版1のファイルを作る（形は e2e/fixtures/saved-result-v1.json と同じ）
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
  // 次にすることが元々ないので、「すべて済み」とは書かない
  await expect(sheet).toContainText("残っていることはありません（今回確かめた範囲では、次にすることは出ていません）。");
  await expect(sheet).not.toContainText("すべて済み");
  await expect(sheet).toContainText("返事待ちの質問はありません。");
  await page.emulateMedia({ media: "screen" });
});

// いちばん長くなる場合：チェック項目が5つの「アカウントと権限」で、4つの観点がすべて「わからない」（穴4件、次にすること12件、根拠3件）、
// ベンダーへの質問3つに要件が4つずつ（返事待ち12件）。この場合は「引き継ぐこと」を足す前から1枚を超える（根拠までで1枚がいっぱい）ので、
// 2枚以内で、「引き継ぐこと」が件数と先頭の文にまとまっていること、2枚目に分かれても節や文の途中で切れないことを確かめる。
// 高さは実測を DEVLOG に書くために出す
test("引き継ぎ：いちばん長くなる場合（アカウントと権限、穴4件、返事待ち12件）でも、「引き継ぐこと」は短くまとまり、2枚以内で、改ページで崩れない", async ({ page }) => {
  const viewpointIds = ["admin", "reuse", "cleanup", "two_factor"];
  const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "saved-result-v1.json"), "utf8"));
  fixture.items[0].itemId = "accounts";
  fixture.items[0].vendorAnswer = "unknown";
  fixture.items[0].states = Object.fromEntries(viewpointIds.map((id) => [id, "unknown"]));
  fixture.items[0].sources = Object.fromEntries(viewpointIds.map((id) => [id, "answer"]));
  fixture.items[0].reasons = Object.fromEntries(viewpointIds.map((id) => [id, "分からないとの回答でした。"]));
  fixture.items[0].summary = "権限、使い回し、不要なアカウント、本人の確かめ方のいずれも、分からないとの回答でした。";
  fixture.items[0].vendorQuestions = [1, 2, 3].map((q) => ({
    gapType: "outside",
    concern: "だれが強い権限を持ち、どのアカウントが残っているかが分からない。",
    question: `アカウントと権限について、次の点を、はい／いいえで教えてください（${q}）。`,
    requirements: viewpointIds.map((viewpointId, index) => ({
      id: `q${q}_r${index + 1}`,
      viewpointId,
      text: `（${q}-${index + 1}）設定を変えられる強い権限を持つアカウントの一覧があり、必要な人だけに絞られている`,
      followUp: "次の点を教えてください：強い権限を持つアカウントの一覧",
    })),
  }));
  mkdirSync(RESULTS_DIR, { recursive: true });
  const longestPath = path.join(RESULTS_DIR, "handover-longest-v1.json");
  writeFileSync(longestPath, JSON.stringify(fixture, null, 2));

  await page.goto("/");
  await page.getByLabel("続きを再開するためのファイルを読み込む").setInputFiles(longestPath);
  await expect(page.getByRole("heading", { name: "問診のまとめ" })).toBeVisible();
  const holes = page.getByRole("region", { name: HOLES_REGION });
  await expect(holes.getByText("残っていること 12件（全部で12件）")).toBeVisible();

  const sheet = page.locator("#print-sheet");
  await page.emulateMedia({ media: "print" });
  await expect(sheet).toContainText("残っていること 12件（次にすること 12件のうち、済みでないもの）");
  await expect(sheet).toContainText("返事待ち 12件");
  await expect(sheet).toContainText("ほか10件");
  await page.setViewportSize({ width: PRINTABLE_WIDTH_PX, height: 900 });
  const height = await sheet.evaluate((element) => element.getBoundingClientRect().height);
  // 「引き継ぐこと」の節（見出しと一覧を包む div）の高さ。これを引いた分が、足す前の高さ
  const handoverHeight = await sheet
    .getByRole("heading", { name: "引き継ぐこと" })
    .evaluate((heading) => heading.parentElement!.getBoundingClientRect().height);
  // 印刷できる幅での1枚全体の画像（縦に続く表示。改ページの位置はこの画像では分からない）
  await saveScreenshot(page, "item11-print-longest", sheet);
  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true });
  const pdfPath = path.join(RESULTS_DIR, "handover-longest-print.pdf");
  writeFileSync(pdfPath, pdf);
  const pageCount = (pdf.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;

  // 2枚になるが、崩れない：段組みで改ページを再現し、見出し・段落・項目が途中で切れず、見出しが取り残されず、
  // 2枚目が見出しか項目の先頭から始まることを確かめる。再現した枚数は PDF のページ数と同じ。1枚目と2枚目が横に並んだ画像も残す
  await emulatePrintPages(sheet, true);
  const layout = await readPrintLayout(sheet);
  const { pages, secondPageFirst } = expectCleanPageBreaks(layout, 2);
  expect(pages, "段組みで再現した枚数と PDF のページ数").toBe(pageCount);
  const firstPageBottom = Math.max(...layout.boxes.filter((box) => box.page === 0).map((box) => box.bottom));
  await page.setViewportSize({ width: 2300, height: 1100 });
  await saveScreenshot(page, "item11-print-longest-pages", sheet);

  // 段組みで再現した2枚目の先頭が、実際の PDF の2枚目の先頭と同じ文であること。PDF の文字は poppler の pdftotext で取り出す
  //（入っていない環境では飛ばし、ログに出す）。空白は折り返しで変わるので除いて比べる
  const pdfSecondPage = spawnSync("pdftotext", ["-f", "2", "-l", "2", pdfPath, "-"], { encoding: "utf8" });
  if (secondPageFirst && pdfSecondPage.status === 0) {
    const pdfText = pdfSecondPage.stdout.replace(/\s/g, "");
    const expected = secondPageFirst.text.replace(/\s/g, "");
    expect(pdfText.slice(0, 80), `PDF の2枚目の先頭が「${expected}」で始まる`).toMatch(new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  } else {
    console.log("[handover] pdftotext が使えないので、PDF の2枚目の先頭の照合は飛ばした");
  }

  // 切れ目が別の位置に来ても崩れないこと：題名の上に余白を足して中身を1行（20px）ずつ下へずらし、切れ目が箇条書きの項目や
  // 見出しに当たる位置でも、途中で切れる要素がなく、2枚目が見出しか項目の先頭から始まることを確かめる。
  // 見出しが取り残されない指定（break-after-avoid）と、項目が途中で切れない指定の両方が試されたことも照らす
  const title = sheet.locator("h1");
  const shifted: string[] = [];
  const startTags = new Set<string>();
  for (let offset = 20; offset <= 480; offset += 20) {
    await title.evaluate((heading, px) => {
      heading.style.marginTop = `${px}px`;
    }, offset);
    const { secondPageFirst: first } = expectCleanPageBreaks(await readPrintLayout(sheet), 2);
    const start = first ? `「${first.text}」（${first.tag}）` : "なし";
    if (first) startTags.add(first.tag);
    if (shifted.length === 0 || !shifted[shifted.length - 1].endsWith(start)) shifted.push(`${offset}px → ${start}`);
  }
  await title.evaluate((heading) => {
    heading.style.marginTop = "";
  });
  console.log(`[handover] 切れ目をずらしたとき（題名の上の余白 → 2枚目の先頭。同じ先頭が続く間は省く）：${shifted.join("、")}`);
  expect([...startTags].some((tag) => tag === "H2" || tag === "H3"), "見出しが2枚目の先頭になる位置があった").toBe(true);
  expect(startTags.has("LI"), "箇条書きの項目が2枚目の先頭になる位置があった").toBe(true);
  await emulatePrintPages(sheet, false);
  console.log(
    `[handover] いちばん長い1枚：幅 ${PRINTABLE_WIDTH_PX}px で高さ ${Math.round(height)}px（うち「引き継ぐこと」${Math.round(handoverHeight)}px、上限 ${Math.round(PRINTABLE_HEIGHT_PX)}px）、PDF ${pageCount}ページ。` +
      `1枚目は ${Math.round(firstPageBottom)}px まで使い、2枚目は${secondPageFirst ? `「${secondPageFirst.text}」（${secondPageFirst.tag}）` : "なし"}から`,
  );
  expect(handoverHeight).toBeLessThan(200);
  expect(pageCount, `1枚の高さ ${Math.round(height)}px`).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ media: "screen" });
});
