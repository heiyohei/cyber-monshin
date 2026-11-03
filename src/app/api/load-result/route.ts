import { getSessionSecret } from "@/lib/auth";
import { buildCard } from "@/lib/card";
import { sessionFromSaveFile } from "@/lib/save-file";
import { itemOf, sealSession, vendorRequestFor } from "@/lib/session";

const MAX_FILE_LENGTH = 64_000;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

// 保存したファイルを確かめて、返事の検証を続けられる状態に戻す。Claude は呼ばない
export async function POST(request: Request) {
  const secret = getSessionSecret();
  if (!secret) return fail(503, "現在はご利用いただけません。このアプリの設定に問題があるため、管理者に連絡してください。");

  const text = await request.text();
  if (text.length > MAX_FILE_LENGTH) return fail(413, "ファイルが大きすぎます。");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "このアプリで保存したファイルを選んでください。");
  }

  const loaded = sessionFromSaveFile(json);
  if (!loaded) return fail(400, "このアプリで保存したファイルを選んでください。");

  const { session, file, done } = loaded;
  const item = file.items[0];
  return Response.json({
    session: sealSession(session, secret),
    card: buildCard(itemOf(session), session.states, session.lastYearAnswer, session.sources),
    reasons: item.reasons,
    summary: item.summary,
    vendor: vendorRequestFor(session),
    // 次にすることの「やった」印（版1のファイルでは空）
    done,
  });
}
