import Anthropic from "@anthropic-ai/sdk";

export const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });

// モデル、上限、指示はサーバーで固定し、ブラウザからは変えられない。
export const CLAUDE_PARAMS = {
  model: "claude-opus-5-5",
  max_tokens: 8000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  thinking: { type: "adaptive" },
} as const;

// 問診と返事の読み解き（Opus 5.5）は fast mode で呼ぶ。待ちの大半は Claude が書く時間で、fast mode は書く速さを上げる
// （DEVLOG「問診の待ち時間を区間ごとに測った」）。料金は2倍。写真（Sonnet）とことばの相談（Haiku）は対象外
export type Speed = "fast" | "standard";

// fast の1回目は SDK の自動の再試行をせず（maxRetries: 0）、混み合っているとき（429、529）は待たずにふつうの速さで送り直す。
// 前は SDK が1回だけ送り直していた一時的な失敗（408、409、500番台、通信の失敗、時間切れ）も、ふつうの速さで1回送り直す。
// 中断（APIUserAbortError）と、それ以外の 400番台は送り直さない
export function shouldResend(error: unknown): boolean {
  if (error instanceof Anthropic.APIUserAbortError) return false;
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (!(error instanceof Anthropic.APIError) || error.status === undefined) return false;
  return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
}

type FastStream = {
  on(event: "streamEvent", listener: () => void): unknown;
  finalMessage(): Promise<Anthropic.Beta.BetaMessage>;
};

// 応答が1つでも届いたあとの失敗は送り直さない。途中で処理した読み取り（interview.ts）が二重にならないようにするため
export async function finalMessageFast(
  route: string,
  open: (speed: Speed, options: { maxRetries?: number }) => FastStream,
): Promise<Anthropic.Beta.BetaMessage> {
  let started = false;
  try {
    const stream = open("fast", { maxRetries: 0 });
    stream.on("streamEvent", () => {
      started = true;
    });
    return await stream.finalMessage();
  } catch (error) {
    if (started || !shouldResend(error)) throw error;
    console.info(`[${route}] fast mode で送れなかったので、ふつうの速さで送り直します`, {
      type: error instanceof Error ? error.name : "unknown",
      status: error instanceof Anthropic.APIError ? error.status : undefined,
    });
    return open("standard", { maxRetries: 0 }).finalMessage();
  }
}

export const MAX_CALLS_PER_REQUEST = 6;
export const MAX_BODY_LENGTH = 256_000;

export type Usage = { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number };

export function emptyUsage(): Usage {
  return { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "このアプリの設定に問題があります。管理者に連絡してください。";
  if (error instanceof Anthropic.RateLimitError) return "混み合っています。少し待ってからやり直してください。";
  if (error instanceof Anthropic.APIConnectionError) return "接続できませんでした。もう一度ボタンを押してください。";
  if (error instanceof Anthropic.APIError) return "処理に失敗しました。もう一度ボタンを押してください。";
  return "処理に失敗しました。もう一度ボタンを押してください。";
}

// 回答の本文を残さないよう、ログには種類と状態コードだけを出す。
export function logApiError(route: string, error: unknown) {
  const status = error instanceof Anthropic.APIError ? error.status : undefined;
  console.error(`[${route}] 失敗`, { type: error instanceof Error ? error.name : "unknown", status });
}
