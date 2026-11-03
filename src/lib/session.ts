import type Anthropic from "@anthropic-ai/sdk";
import { findItem } from "../data/items.ts";
import type { FocusItem } from "../data/types.ts";
import type { Requirement } from "./quote.ts";
import { initialStates, type ViewpointStates } from "./verdict.ts";
import { sign, verify } from "./session-token.ts";

const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type LastYearAnswer = "yes" | "no" | "unknown";
export type VendorAnswer = "yes" | "no" | "not_applicable" | "no_item" | "unknown";
export type GapType = "not_applicable" | "no_item" | "outside";

export type VendorQuestion = {
  gapType: GapType;
  concern: string;
  question: string;
  requirements: Requirement[];
};

export type VendorRequest = { question: string; requirements: Requirement[] };

// ブラウザのメモリに預ける問診の状態。履歴は追記だけにする。1つの問診で1つの重点項目を確かめる
export type InterviewSession = {
  version: 3;
  issuedAt: number;
  itemId: string;
  lastYearAnswer: LastYearAnswer;
  vendorAnswer: VendorAnswer;
  messages: Anthropic.Beta.BetaMessageParam[];
  states: ViewpointStates;
  answerCount: number;
  questionCount: number;
  validationErrors: number;
  pendingQuestionId: string | null;
  pendingResults: Anthropic.Beta.BetaToolResultBlockParam[];
  vendorQuestions: VendorQuestion[];
  finished: boolean;
  termCount?: number;
  // 写真や画面で答えた回数。署名つきで数えるので、ブラウザ側で書き換えられない
  imageCount?: number;
};

export type SealedSession = { payload: string; signature: string };

export function createSession(
  item: FocusItem,
  lastYearAnswer: LastYearAnswer,
  vendorAnswer: VendorAnswer,
): InterviewSession {
  return {
    version: 3,
    issuedAt: Date.now(),
    itemId: item.id,
    lastYearAnswer,
    vendorAnswer,
    messages: [],
    states: initialStates(item),
    answerCount: 0,
    questionCount: 0,
    validationErrors: 0,
    pendingQuestionId: null,
    pendingResults: [],
    vendorQuestions: [],
    finished: false,
  };
}

// 署名で守られた状態から作るので、ここで見つからないことはない
export function itemOf(session: InterviewSession): FocusItem {
  const item = findItem(session.itemId);
  if (!item) throw new Error(`unknown item: ${session.itemId}`);
  return item;
}

// Claude が確認事項を作らなかった穴は、観点の固定データから確認事項を作って補う
export function vendorRequestFor(session: InterviewSession): VendorRequest | null {
  if (session.vendorQuestions.length > 0) {
    return {
      question: session.vendorQuestions.map((item) => item.question).join("\n"),
      requirements: session.vendorQuestions.flatMap((item) => item.requirements),
    };
  }
  const item = itemOf(session);
  const holes = item.viewpoints.filter(
    (viewpoint) => session.states[viewpoint.id] === "denied" || session.states[viewpoint.id] === "unknown",
  );
  if (holes.length === 0) return null;
  return {
    question: [
      `${item.name}について、次の点を、はい／いいえで教えてください。`,
      ...holes.map((viewpoint, index) => `${index + 1}. ${viewpoint.goal}か。`),
    ].join("\n"),
    requirements: holes.map((viewpoint) => ({
      id: `s_${viewpoint.id}`,
      viewpointId: viewpoint.id,
      text: viewpoint.goal,
      followUp: `次の点を教えてください：${viewpoint.goal}か。`,
    })),
  };
}

export function sealSession(session: InterviewSession, secret: string): SealedSession {
  const payload = JSON.stringify(session);
  return { payload, signature: sign(payload, secret) };
}

export function openSession(sealed: SealedSession, secret: string): InterviewSession | null {
  if (!verify(sealed.payload, sealed.signature, secret)) return null;
  const session = JSON.parse(sealed.payload) as InterviewSession;
  if (session.version !== 3 || Date.now() - session.issuedAt > MAX_AGE_MS) return null;
  if (!findItem(session.itemId)) return null;
  return session;
}
