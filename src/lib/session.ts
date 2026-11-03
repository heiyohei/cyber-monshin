import type Anthropic from "@anthropic-ai/sdk";
import { initialStates, type ViewpointStates } from "./verdict.ts";
import { sign, verify } from "./session-token.ts";

const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type LastYearAnswer = "yes" | "no" | "unknown";
export type VendorAnswer = "yes" | "no" | "not_applicable" | "no_item" | "unknown";

// ブラウザのメモリに預ける問診の状態。履歴は追記だけにする。
export type InterviewSession = {
  version: 1;
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
};

export type SealedSession = { payload: string; signature: string };

export function createSession(lastYearAnswer: LastYearAnswer, vendorAnswer: VendorAnswer): InterviewSession {
  return {
    version: 1,
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
  };
}

export function sealSession(session: InterviewSession, secret: string): SealedSession {
  const payload = JSON.stringify(session);
  return { payload, signature: sign(payload, secret) };
}

export function openSession(sealed: SealedSession, secret: string): InterviewSession | null {
  if (!verify(sealed.payload, sealed.signature, secret)) return null;
  const session = JSON.parse(sealed.payload) as InterviewSession;
  if (session.version !== 1 || Date.now() - session.issuedAt > MAX_AGE_MS) return null;
  return session;
}
