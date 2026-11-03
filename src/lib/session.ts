import type Anthropic from "@anthropic-ai/sdk";
import { SAMPLE_VENDOR_QUESTION } from "../data/backup.ts";
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

// ブラウザのメモリに預ける問診の状態。履歴は追記だけにする。
export type InterviewSession = {
  version: 2;
  issuedAt: number;
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
};

export type SealedSession = { payload: string; signature: string };

export function createSession(lastYearAnswer: LastYearAnswer, vendorAnswer: VendorAnswer): InterviewSession {
  return {
    version: 2,
    issuedAt: Date.now(),
    lastYearAnswer,
    vendorAnswer,
    messages: [],
    states: initialStates(),
    answerCount: 0,
    questionCount: 0,
    validationErrors: 0,
    pendingQuestionId: null,
    pendingResults: [],
    vendorQuestions: [],
    finished: false,
  };
}

// Claude が確認事項を作らなかった穴は、固定の確認事項で補う
export function vendorRequestFor(session: InterviewSession): VendorRequest | null {
  if (session.vendorQuestions.length > 0) {
    return {
      question: session.vendorQuestions.map((item) => item.question).join("\n"),
      requirements: session.vendorQuestions.flatMap((item) => item.requirements),
    };
  }
  const hasHole = Object.values(session.states).some((status) => status === "denied" || status === "unknown");
  return hasHole ? SAMPLE_VENDOR_QUESTION : null;
}

export function sealSession(session: InterviewSession, secret: string): SealedSession {
  const payload = JSON.stringify(session);
  return { payload, signature: sign(payload, secret) };
}

export function openSession(sealed: SealedSession, secret: string): InterviewSession | null {
  if (!verify(sealed.payload, sealed.signature, secret)) return null;
  const session = JSON.parse(sealed.payload) as InterviewSession;
  if (session.version !== 2 || Date.now() - session.issuedAt > MAX_AGE_MS) return null;
  return session;
}
