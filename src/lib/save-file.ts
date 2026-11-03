import { z } from "zod";
import { getItem } from "../data/items.ts";
import { createSession, itemOf, type InterviewSession } from "./session.ts";

// 手元に保存する結果。病院名、会話の履歴、Excel の中身は入れない。
// 判定、トップ3、次の一手は読み込むたびに計算するので入れない
export const SAVE_FORMAT = "cyber-monshin-result";
export const SAVE_VERSION = 1;

const Status = z.enum(["not_asked", "confirmed", "denied", "unknown"]);
const ShortText = z.string().max(300);

const ItemResultSchema = z.object({
  itemId: z.string().max(40),
  lastYearAnswer: z.enum(["yes", "no", "unknown"]),
  vendorAnswer: z.enum(["yes", "no", "not_applicable", "no_item", "unknown"]),
  states: z.record(z.string().max(40), Status),
  reasons: z.record(z.string().max(40), ShortText),
  summary: z.string().max(1000),
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

// 観点の ID は項目ごとに違うので、形を確かめたあと、項目の固定データと照らす
export const SaveFileSchema = z
  .object({
    format: z.literal(SAVE_FORMAT),
    version: z.literal(SAVE_VERSION),
    savedAt: z.string().max(40),
    items: z.array(ItemResultSchema).length(1),
  })
  .refine(({ items: [result] }) => {
    const item = getItem(result.itemId);
    if (!item) return false;
    const ids = item.viewpoints.map((viewpoint) => viewpoint.id);
    const keys = Object.keys(result.states);
    return (
      keys.length === ids.length &&
      ids.every((id) => keys.includes(id)) &&
      Object.keys(result.reasons).every((id) => ids.includes(id)) &&
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
): SaveFile {
  const ids = itemOf(session).viewpoints.map((viewpoint) => viewpoint.id);
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
        reasons: Object.fromEntries(ids.flatMap((id) => (reasons[id] ? [[id, reasons[id]!.slice(0, 300)]] : []))),
        summary: summary.slice(0, 1000),
        vendorQuestions: session.vendorQuestions,
      },
    ],
  };
}

// 読み込んだファイルは信頼できない入力。形と値を確かめてから、終わった問診として復元する
export function sessionFromSaveFile(input: unknown): { session: InterviewSession; file: SaveFile } | null {
  const parsed = SaveFileSchema.safeParse(input);
  if (!parsed.success) return null;

  const result = parsed.data.items[0];
  const item = getItem(result.itemId)!;
  const session = createSession(item, result.lastYearAnswer, result.vendorAnswer);
  session.states = result.states;
  session.vendorQuestions = result.vendorQuestions;
  session.finished = true;
  return { session, file: parsed.data };
}
