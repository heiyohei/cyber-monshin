"use client";

import { useState, type FormEvent } from "react";
import type { Card } from "@/lib/card";
import type { InterviewEvent } from "@/lib/interview";
import type { ReadResult } from "@/lib/quote";
import type { SealedSession } from "@/lib/session";

type Question = { text: string; why: string; options: string[] };
type ServerEvent = InterviewEvent | { type: "session"; session: SealedSession };

const STATUS_LABELS = {
  not_asked: "まだ確かめていません",
  confirmed: "回答で確認",
  denied: "できていない",
  unknown: "わからない",
} as const;

const RESULT_LABELS = {
  met: "満たす",
  not_met: "満たさない",
  ambiguous: "曖昧",
  no_answer: "回答なし",
} as const;

const buttonClass =
  "rounded-lg bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50";
const fieldClass = "w-full rounded-lg border border-foreground/30 bg-transparent p-2";

export function InterviewDemo({
  initialCard,
  vendorQuestion,
  requirements,
}: {
  initialCard: Card;
  vendorQuestion: string;
  requirements: { id: string; viewpointId: string; text: string }[];
}) {
  const [card, setCard] = useState(initialCard);
  const [session, setSession] = useState<SealedSession | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [reply, setReply] = useState("");
  const [results, setResults] = useState<ReadResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canContinue, setCanContinue] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");

  function handleEvent(event: ServerEvent) {
    if (event.type === "question") setQuestion(event);
    if (event.type === "message") setNote(event.text);
    if (event.type === "can_continue") setCanContinue(true);
    if (event.type === "error") setError(event.message);
    if (event.type === "session") setSession(event.session);
    if (event.type === "verdict_updated") setCard(event.card);
    if (event.type === "viewpoint_updated") {
      setCard(event.card);
      setReasons((current) => ({ ...current, [event.viewpointId]: event.reason }));
    }
  }

  async function failFrom(response: Response) {
    const data = await response.json().catch(() => null);
    if (response.status === 401) setNeedsCode(true);
    setError(data?.error ?? "処理に失敗しました。やり直してください。");
  }

  // 署名つきの状態が届いたときだけ成功とする。失敗したら画面を送信前に戻し、やり直せるようにする
  async function sendInterview(body: object) {
    const before = { question, card, reasons };
    let received = false;
    let failed = false;
    setBusy(true);
    setError("");
    setQuestion(null);
    setCanContinue(false);
    try {
      const response = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok || !response.body) {
        await failFrom(response);
        failed = true;
        return false;
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as ServerEvent;
          if (event.type === "session") received = true;
          if (event.type === "error") failed = true;
          handleEvent(event);
        }
      }
      if (!received && !failed) setError("処理が途中で止まりました。やり直してください。");
      return received;
    } catch {
      setError("接続できませんでした。やり直してください。");
      return false;
    } finally {
      if (!received) {
        setQuestion(before.question);
        setCard(before.card);
        setReasons(before.reasons);
      }
      setBusy(false);
    }
  }

  function start() {
    return sendInterview({ last_year_answer: "yes", vendor_answer: "no_item" });
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault();
    const sent = await sendInterview({ session, answer });
    if (sent) setAnswer("");
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      await failFrom(response);
      return;
    }
    setNeedsCode(false);
    setCode("");
  }

  async function submitReply(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/verify-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, reply }),
      });
      if (!response.ok) {
        await failFrom(response);
        return;
      }
      const data = await response.json();
      const checked: ReadResult[] = data.results;
      setResults(checked);
      setCard(data.card);
      // 状態が変わった観点は、前の回答の理由を返事の読み取りに置き換える
      setReasons((current) => {
        const next = { ...current };
        for (const result of checked) {
          const viewpointId = requirements.find((item) => item.id === result.requirement_id)?.viewpointId;
          if (viewpointId && (result.result === "met" || result.result === "not_met")) {
            next[viewpointId] = result.plain;
          }
        }
        return next;
      });
      setSession(data.session);
    } catch {
      setError("接続できませんでした。やり直してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="flex flex-col gap-6" aria-label="問診とベンダーの返事">
        {error && (
          <p role="alert" className="rounded-lg border border-foreground/40 p-3">
            {error}
          </p>
        )}

        {needsCode && (
          <form onSubmit={submitCode} className="flex flex-col gap-2">
            <label htmlFor="access-code" className="font-medium">
              合言葉
            </label>
            <input
              id="access-code"
              type="password"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={fieldClass}
            />
            <button type="submit" disabled={!code} className={buttonClass}>
              確かめる
            </button>
          </form>
        )}

        {!session && !busy && (
          <button type="button" onClick={start} className={buttonClass}>
            問診を始める
          </button>
        )}

        {busy && <p aria-live="polite">確認しています…</p>}

        {canContinue && !busy && (
          <button type="button" onClick={() => sendInterview({ session })} className={buttonClass}>
            続ける
          </button>
        )}

        {question && !busy && (
          <form onSubmit={submitAnswer} className="flex flex-col gap-3">
            <p className="text-lg font-medium">{question.text}</p>
            <p className="text-sm opacity-80">なぜこの質問？ {question.why}</p>
            {question.options.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswer(option)}
                    className="rounded-lg border border-foreground/30 px-3 py-1 text-sm"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            <label htmlFor="answer" className="text-sm font-medium">
              回答（1,000文字まで。病院名、担当者名、IP アドレスは書かないでください）
            </label>
            <textarea
              id="answer"
              rows={3}
              maxLength={1000}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              className={fieldClass}
            />
            <button type="submit" disabled={!answer.trim()} className={buttonClass}>
              回答する
            </button>
          </form>
        )}

        {note && <p className="whitespace-pre-wrap leading-relaxed">{note}</p>}

        {session && (
          <form onSubmit={submitReply} className="flex flex-col gap-3 border-t border-foreground/20 pt-6">
            <h2 className="text-lg font-bold">ベンダーの返事を確かめる</h2>
            <p className="text-sm leading-relaxed">確認事項（サンプル）：{vendorQuestion}</p>
            <label htmlFor="reply" className="text-sm font-medium">
              返事（4,000文字まで。病院名、担当者名、IP アドレスは消してください）
            </label>
            <textarea
              id="reply"
              rows={5}
              maxLength={4000}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              className={fieldClass}
            />
            <button type="submit" disabled={busy || !reply.trim()} className={buttonClass}>
              返事を確かめる
            </button>
          </form>
        )}

        {results.length > 0 && (
          <ul className="flex flex-col gap-3">
            {results.map((result) => (
              <li key={result.requirement_id} className="rounded-lg border border-foreground/20 p-3">
                <p className="font-medium">
                  {requirements.find((item) => item.id === result.requirement_id)?.text}：
                  {RESULT_LABELS[result.result]}
                </p>
                {result.quote && <blockquote className="mt-1 text-sm opacity-80">原文：{result.quote}</blockquote>}
                <p className="mt-1 text-sm">{result.plain}</p>
                {result.follow_up && <p className="mt-1 text-sm">追加の質問：{result.follow_up}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="flex flex-col gap-4 rounded-lg border border-foreground/20 p-4" aria-label="判定">
        <div aria-live="polite">
          <p className="text-sm opacity-70">バックアップと復旧（3-②）</p>
          <p className="text-2xl font-bold">{card.label}</p>
        </div>
        <ul className="flex flex-col gap-3">
          {card.viewpoints.map((viewpoint) => (
            <li key={viewpoint.id} className="text-sm leading-relaxed">
              <p className="font-medium">
                {viewpoint.name}：{STATUS_LABELS[viewpoint.status]}
              </p>
              {reasons[viewpoint.id] && <p>{reasons[viewpoint.id]}</p>}
              {viewpoint.status !== "not_asked" && (
                <p className="opacity-80">根拠：{viewpoint.evidence}</p>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
