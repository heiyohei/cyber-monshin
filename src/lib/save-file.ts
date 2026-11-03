import { z } from "zod";
import { createSession, type InterviewSession } from "./session.ts";
import { VIEWPOINT_IDS } from "./verdict.ts";

// 手元に保存する結果。病院名、会話の履歴、Excel の中身は入れない。
// 判定、トップ3、次の一手は読み込むたびに計算するので入れない
export const SAVE_FORMAT = "cyber-monshin-result";
export const SAVE_VERSION = 1;

const Status = z.enum(["not_asked", "confirmed", "denied", "unknown"]);
const Viewpoint = z.enum(VIEWPOINT_IDS);
const ShortText = z.string().max(300);

export const SaveFileSchema = z.object({
  format: z.literal(SAVE_FORMAT),
  version: z.literal(SAVE_VERSION),
  savedAt: z.string().max(40),
  items: z
    .array(
      z.object({
        itemId: z.literal("backup"),
        lastYearAnswer: z.enum(["yes", "no", "unknown"]),
        vendorAnswer: z.enum(["yes", "no", "not_applicable", "no_item", "unknown"]),
        states: z.object({ acquire: Status, restore: Status, isolate: Status, procedure: Status }),
        reasons: z.partialRecord(Viewpoint, ShortText),
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
                    viewpointId: Viewpoint,
                    text: z.string().min(1).max(200),
                    followUp: ShortText,
                  }),
                )
                .min(1)
                .max(4),
            }),
          )
          .max(3),
      }),
    )
    .length(1),
});

export type SaveFile = z.infer<typeof SaveFileSchema>;

export function buildSaveFile(
  session: InterviewSession,
  reasons: Partial<Record<string, string>>,
  summary: string,
): SaveFile {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    items: [
      {
        itemId: "backup",
        lastYearAnswer: session.lastYearAnswer,
        vendorAnswer: session.vendorAnswer,
        states: session.states,
        reasons: Object.fromEntries(
          VIEWPOINT_IDS.flatMap((id) => (reasons[id] ? [[id, reasons[id]!.slice(0, 300)]] : [])),
        ),
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

  const item = parsed.data.items[0];
  const session = createSession(item.lastYearAnswer, item.vendorAnswer);
  session.states = item.states;
  session.vendorQuestions = item.vendorQuestions;
  session.finished = true;
  return { session, file: parsed.data };
}
