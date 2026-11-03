import { z } from "zod";
import { getSessionSecret } from "@/lib/auth";
import { apiErrorMessage, emptyUsage, logApiError, MAX_BODY_LENGTH } from "@/lib/claude";
import { InterviewStop, runInterview, type InterviewEvent } from "@/lib/interview";
import { createSession, openSession, sealSession, type InterviewSession } from "@/lib/session";

export const maxDuration = 120;

const BodySchema = z.object({
  session: z.object({ payload: z.string(), signature: z.string() }).optional(),
  answer: z.string().trim().min(1).max(1000).optional(),
  last_year_answer: z.enum(["yes", "no", "unknown"]).default("unknown"),
  vendor_answer: z.enum(["yes", "no", "not_applicable", "no_item", "unknown"]).default("unknown"),
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
    return fail(400, "送る内容の形が正しくありません。");
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return fail(400, "回答は1,000文字以内で入力してください。");

  let session: InterviewSession | null;
  if (body.data.session) {
    session = openSession(body.data.session, secret);
    if (!session) return fail(400, "問診の情報を確認できませんでした。最初からやり直してください。");
  } else {
    session = createSession(body.data.last_year_answer, body.data.vendor_answer);
  }
  const current = session;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: InterviewEvent | { type: "session"; session: ReturnType<typeof sealSession> }) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const usage = emptyUsage();
      const startedAt = Date.now();
      try {
        await runInterview(current, body.data.answer, send, request.signal, usage);
        send({ type: "session", session: sealSession(current, secret) });
      } catch (error) {
        if (error instanceof InterviewStop) {
          send({ type: "error", message: error.message });
        } else {
          logApiError("interview", error);
          send({ type: "error", message: apiErrorMessage(error) });
        }
      } finally {
        // 回答の本文は出さず、回数とトークン数だけを残す
        console.info("[interview] 実測", { ...usage, ms: Date.now() - startedAt });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
