import { z } from "zod";
import { getSessionSecret } from "@/lib/auth";
import { buildCard } from "@/lib/card";
import { apiErrorMessage, emptyUsage, logApiError, MAX_BODY_LENGTH } from "@/lib/claude";
import { itemOf, openSession, sealSession, vendorRequestFor } from "@/lib/session";
import { verifyVendorReply, VendorReplyStop } from "@/lib/vendor-reply";

export const maxDuration = 120;

const BodySchema = z.object({
  session: z.object({ payload: z.string(), signature: z.string() }),
  reply: z.string().trim().min(1).max(4000),
});

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const secret = getSessionSecret();
  if (!secret) return fail(503, "現在はご利用いただけません。このアプリの設定に問題があるため、管理者に連絡してください。");

  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) return fail(413, "送る内容が長すぎます。");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "うまく送れませんでした。画面を読み込み直して、もう一度お試しください。");
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return fail(400, "返事は4,000文字以内で貼り付けてください。");

  const session = openSession(body.data.session, secret);
  if (!session) return fail(400, "問診を始めてから時間がたったか、問診の情報を確かめられませんでした。最初からやり直すか、保存したファイルを読み込んでください。");

  const vendorRequest = vendorRequestFor(session);
  if (!vendorRequest) return fail(400, "ベンダーに聞くことがないため、返事を確かめる必要はありません。");

  const usage = emptyUsage();
  const startedAt = Date.now();
  try {
    const { results, states } = await verifyVendorReply(
      body.data.reply,
      vendorRequest,
      session.states,
      request.signal,
      usage,
    );
    console.info("[verify-reply] 実測", { ...usage, ms: Date.now() - startedAt });
    session.states = states;
    return Response.json({
      results,
      card: buildCard(itemOf(session), states, session.lastYearAnswer),
      session: sealSession(session, secret),
    });
  } catch (error) {
    if (error instanceof VendorReplyStop) return fail(422, error.message);
    logApiError("verify-reply", error);
    return fail(502, apiErrorMessage(error));
  }
}
