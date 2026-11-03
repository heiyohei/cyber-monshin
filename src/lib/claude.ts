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

export const MAX_CALLS_PER_REQUEST = 6;
export const MAX_BODY_LENGTH = 256_000;

export type Usage = { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number };

export function emptyUsage(): Usage {
  return { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "サーバーの設定に問題があります。";
  if (error instanceof Anthropic.RateLimitError) return "混み合っています。少し待ってからやり直してください。";
  if (error instanceof Anthropic.APIConnectionError) return "接続できませんでした。やり直してください。";
  if (error instanceof Anthropic.APIError) return "処理に失敗しました。やり直してください。";
  return "処理に失敗しました。やり直してください。";
}

// 回答の本文を残さないよう、ログには種類と状態コードだけを出す。
export function logApiError(route: string, error: unknown) {
  const status = error instanceof Anthropic.APIError ? error.status : undefined;
  console.error(`[${route}] 失敗`, { type: error instanceof Error ? error.name : "unknown", status });
}
