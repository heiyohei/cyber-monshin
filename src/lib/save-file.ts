import { z } from "zod";
import { getItem } from "../data/items.ts";
import { tokyoDateStringOf } from "./date.ts";
import { stepIdsOf } from "./result.ts";
import { createSession, itemOf, type InterviewSession } from "./session.ts";

// 手元に保存する結果。病院名、会話の履歴、Excel の中身は入れない。
// 判定、トップ3、次の一手は読み込むたびに計算するので入れない。
// 版2で、次にすることの「やった」印（固定データの次の一手の ID）を足した。版1のファイルは印なしとして読み込める
export const SAVE_FORMAT = "cyber-monshin-result";
export const SAVE_VERSION = 2;
const READABLE_VERSIONS = [1, SAVE_VERSION] as const;

const Status = z.enum(["not_asked", "confirmed", "denied", "unknown"]);
const ShortText = z.string().max(300);

const ItemResultSchema = z.object({
  itemId: z.string().max(40),
  lastYearAnswer: z.enum(["yes", "no", "unknown"]),
  vendorAnswer: z.enum(["yes", "no", "not_applicable", "no_item", "unknown"]),
  states: z.record(z.string().max(40), Status),
  // 前の版のファイルにはないので、なくても読み込める
  sources: z.record(z.string().max(40), z.enum(["answer", "reply"])).optional(),
  reasons: z.record(z.string().max(40), ShortText),
  summary: z.string().max(1000),
  // 版2から。「やった」印を付けた次の一手の ID。版1にはない
  done: z.array(z.string().max(80)).max(60).optional(),
  vendorQuestions: z
    .array(
      z.object({
        gapType: z.enum(["not_applicable", "no_item", "outside"]),
        concern: ShortText,
        question: z.string().min(1).max(1000),
        requirements: z
          .array(
            z.object({
              id: z.string().regex(/^q\d_r\d$/),
              viewpointId: z.string().max(40),
              text: z.string().min(1).max(200),
              followUp: ShortText,
            }),
          )
          .min(1)
          .max(4),
      }),
    )
    .max(3),
});

// 観点の ID は項目ごとに違うので、形を確かめたあと、項目の固定データと照らす。
// 版1と版2の両方を読む。版1に「やった」印（done）があれば形式違いとして拒む
export const SaveFileSchema = z
  .object({
    format: z.literal(SAVE_FORMAT),
    version: z.literal(READABLE_VERSIONS),
    savedAt: z.string().max(40),
    items: z.array(ItemResultSchema).length(1),
  })
  .refine(({ version, items: [result] }) => {
    const item = getItem(result.itemId);
    if (!item) return false;
    if (version === 1 && result.done !== undefined) return false;
    const ids = item.viewpoints.map((viewpoint) => viewpoint.id);
    const stepIds = stepIdsOf(item);
    const keys = Object.keys(result.states);
    return (
      keys.length === ids.length &&
      ids.every((id) => keys.includes(id)) &&
      Object.keys(result.reasons).every((id) => ids.includes(id)) &&
      Object.keys(result.sources ?? {}).every((id) => ids.includes(id)) &&
      (result.done ?? []).every((id) => stepIds.includes(id)) &&
      result.vendorQuestions.every((question) =>
        question.requirements.every((requirement) => ids.includes(requirement.viewpointId)),
      )
    );
  });

export type SaveFile = z.infer<typeof SaveFileSchema>;

export function buildSaveFile(
  session: InterviewSession,
  reasons: Partial<Record<string, string>>,
  summary: string,
  done: readonly string[] = [],
): SaveFile {
  const item = itemOf(session);
  const ids = item.viewpoints.map((viewpoint) => viewpoint.id);
  const marked = new Set(done);
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    items: [
      {
        itemId: session.itemId,
        lastYearAnswer: session.lastYearAnswer,
        vendorAnswer: session.vendorAnswer,
        states: session.states,
        sources: Object.fromEntries(
          ids.flatMap((id) => (session.sources?.[id] ? [[id, session.sources[id]!] as const] : [])),
        ),
        reasons: Object.fromEntries(ids.flatMap((id) => (reasons[id] ? [[id, reasons[id]!.slice(0, 300)]] : []))),
        summary: summary.slice(0, 1000),
        vendorQuestions: session.vendorQuestions,
        // この項目の次の一手の ID だけを、固定データの順で入れる（重複や知らない ID は落とす）
        done: stepIdsOf(item).filter((id) => marked.has(id)),
      },
    ],
  };
}

// 手元に保存するときのファイルの名前。日付は日本時間（中の savedAt は UTC のまま）。
// buildSaveFile が作った savedAt は必ず読めるが、万一読めなければ日付を付けない
export function saveFileNameOf(file: Pick<SaveFile, "savedAt">): string {
  const date = tokyoDateStringOf(file.savedAt);
  return `サイバー問診_続きを再開するためのファイル${date ? `_${date}` : ""}.json`;
}

export type LoadedSaveFile = { session: InterviewSession; file: SaveFile; done: string[] };

// 読み込んだファイルは信頼できない入力。形と値を確かめてから、終わった問診として復元する。
// 「やった」印は問診の状態（署名つきでサーバーへ送るもの）には入れず、別に返す
export function sessionFromSaveFile(input: unknown): LoadedSaveFile | null {
  const parsed = SaveFileSchema.safeParse(input);
  if (!parsed.success) return null;

  const result = parsed.data.items[0];
  const item = getItem(result.itemId)!;
  const session = createSession(item, result.lastYearAnswer, result.vendorAnswer);
  session.states = result.states;
  session.sources = result.sources ?? {};
  session.vendorQuestions = result.vendorQuestions;
  session.finished = true;
  return { session, file: parsed.data, done: [...new Set(result.done ?? [])] };
}
