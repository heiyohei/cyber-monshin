import { defineConfig } from "playwright/test";

// e2e テスト（ブラウザで画面を動かす）の設定。テストは e2e/ に置く。
// 無料の組は Claude を呼ばない。有料の組（題名に @paid）は E2E_PAID=1 のときだけ動く。
// @playwright/test は next の peer の範囲（^1.51.1）と合わない alpha 版なので、
// 同じ中身の playwright/test を使い、@playwright/mcp と同じ版の Chromium を使う
//
// ポートは既定 3001。同じディレクトリで npm run dev（3000）を動かしたままだと、next dev は
// 2つ目を起こせない（「Another next dev server is already running」）ので、そのときは
// E2E_PORT=3000 にして、動いているサーバーを使う。別の worktree と同時に動かすときはポートを変える
const port = Number(process.env.E2E_PORT ?? 3001);
const baseURL = `http://localhost:${port}`;
const paid = process.env.E2E_PAID === "1";

export default defineConfig({
  testDir: "e2e",
  // 失敗したときのスクリーンショットと動画の置き場所（git には入れない）
  outputDir: "e2e/results",
  // 画面の流れを順に追えるよう、1つずつ動かす
  workers: 1,
  fullyParallel: false,
  // 開発モードは最初の表示に時間がかかる。有料の組は各テストで延ばす
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium", headless: true } }],
  webServer: {
    command: `npx next dev -p ${port}`,
    url: baseURL,
    // 同じポートで動いている開発サーバーがあれば、それを使う
    reuseExistingServer: true,
    timeout: 180_000,
    // 合言葉なしで動かす。.env に ACCESS_CODE があっても、先に入っている環境変数が優先される（@next/env）。
    // 使い回す開発サーバーには効かないので、合言葉つきで動かしているサーバーでは失敗する
    env: { ACCESS_CODE: "" },
    // 有料の組では、サーバーのログに出るトークン数（[interview] 実測 など）を見て費用を計算する
    stdout: paid ? "pipe" : "ignore",
    stderr: "pipe",
  },
});
