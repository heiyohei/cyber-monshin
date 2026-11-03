import { z } from "zod";
import { getSessionSecret } from "@/lib/auth";
import { apiErrorMessage, emptyUsage, logApiError, MAX_BODY_LENGTH } from "@/lib/claude";
import { openSession, sealSession } from "@/lib/session";
import { askTerm, currentQuestion, MAX_TERM_LENGTH, MAX_TERM_QUESTIONS, TermStop } from "@/lib/term";

export const maxDuration = 60;

const BodySchema = z.object({
  session: z.object({ payload: z.string(), signature: z.string() }),
  question: z.string().trim().min(1).max(MAX_TERM_LENGTH),
});

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const secret = getSessionSecret();
  if (!secret) return fail(503, "現在はご利用いただけません。");

  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) return fail(413, "送る内容が長すぎます。");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "うまく送れませんでした。画面を読み込み直して、もう一度お試しください。");
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return fail(400, `相談は${MAX_TERM_LENGTH}文字以内で入力してください。`);

  const session = openSession(body.data.session, secret);
  if (!session) return fail(400, "問診を始めてから時間がたったか、問診の情報を確かめられませんでした。最初からやり直すか、保存したファイルを読み込んでください。");

  // 回数は署名された状態で数えるので、ブラウザ側で書き換えられない
  const used = session.termCount ?? 0;
  if (used >= MAX_TERM_QUESTIONS) {
    return fail(429, `ことばの相談は、1回の問診で${MAX_TERM_QUESTIONS}回までです。`);
  }

  const usage = emptyUsage();
  const startedAt = Date.now();
  try {
    const answer = await askTerm(body.data.question, currentQuestion(session), request.signal, usage);
    session.termCount = used + 1;
    return Response.json({
      answer,
      remaining: MAX_TERM_QUESTIONS - session.termCount,
      session: sealSession(session, secret),
    });
  } catch (error) {
    if (error instanceof TermStop) return fail(422, error.message);
    logApiError("ask-term", error);
    return fail(502, apiErrorMessage(error));
  } finally {
    // 相談の本文は出さず、回数とトークン数だけを残す
    console.info("[ask-term] 実測", { ...usage, ms: Date.now() - startedAt });
  }
}
