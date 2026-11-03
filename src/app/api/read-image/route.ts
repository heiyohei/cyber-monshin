import { z } from "zod";
import { getSessionSecret } from "@/lib/auth";
import { apiErrorMessage, emptyUsage, logApiError } from "@/lib/claude";
import {
  checkImage,
  IMAGE_MEDIA_TYPES,
  imageGate,
  ImageReadStop,
  MAX_IMAGE_BODY_LENGTH,
  MAX_IMAGES_PER_INTERVIEW,
  readImage,
} from "@/lib/read-image";
import { openSession, sealSession } from "@/lib/session";

export const maxDuration = 60;

const BodySchema = z.object({
  session: z.object({ payload: z.string(), signature: z.string() }),
  image: z.object({ media_type: z.enum(IMAGE_MEDIA_TYPES), data: z.string() }),
});

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const secret = getSessionSecret();
  if (!secret) return fail(503, "現在はご利用いただけません。このアプリの設定に問題があるため、管理者に連絡してください。");

  // 画像が入るので、本文の上限はほかの API より大きい。ブラウザで縮めてから送る
  const text = await request.text();
  if (text.length > MAX_IMAGE_BODY_LENGTH) return fail(413, "画像が大きすぎます。画面の一部だけを保存した画像か、別の写真を選んでください。");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "うまく送れませんでした。画面を読み込み直して、もう一度お試しください。");
  }
  const body = BodySchema.safeParse(json);
  if (!body.success) return fail(400, "画像をうまく送れませんでした。PNG、JPEG、WebP の画像を選んでください。");

  const imageError = checkImage(body.data.image);
  if (imageError) return fail(400, imageError);

  const session = openSession(body.data.session, secret);
  if (!session) return fail(400, "問診を始めてから時間がたったか、問診の情報を確かめられませんでした。最初からやり直すか、保存したファイルを読み込んでください。");

  const gate = imageGate(session);
  if (gate) return fail(gate.status, gate.error);

  const usage = emptyUsage();
  const startedAt = Date.now();
  try {
    const reading = await readImage(body.data.image, session, request.signal, usage);
    session.imageCount = (session.imageCount ?? 0) + 1;
    return Response.json({
      reading,
      remaining: MAX_IMAGES_PER_INTERVIEW - session.imageCount,
      session: sealSession(session, secret),
    });
  } catch (error) {
    if (error instanceof ImageReadStop) return fail(422, error.message);
    logApiError("read-image", error);
    return fail(502, apiErrorMessage(error));
  } finally {
    // 画像も読み取った文字も出さず、回数とトークン数だけを残す
    console.info("[read-image] 実測", { ...usage, ms: Date.now() - startedAt });
  }
}
