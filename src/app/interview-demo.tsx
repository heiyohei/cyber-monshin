"use client";

import { useState, type FormEvent } from "react";
import { SAMPLE_HOSPITAL } from "@/data/sample";
import type { Card } from "@/lib/card";
import type { InterviewEvent } from "@/lib/interview";
import type { ReadResult } from "@/lib/quote";
import type { SealedSession, VendorRequest } from "@/lib/session";

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
  "min-h-14 rounded-8 bg-blue-900 px-6 text-oln-16B-100 text-white hover:bg-blue-1000 hover:underline active:bg-blue-1000 focus-visible:focus-ring disabled:bg-solid-gray-300 disabled:text-solid-gray-800 disabled:no-underline";
const fieldClass =
  "w-full rounded-8 border border-solid-gray-600 bg-white p-4 text-std-16N-170 text-solid-gray-900 hover:border-black focus-visible:focus-ring";
const labelClass = "text-std-16B-170 text-solid-gray-800";
const panelClass = "rounded-12 border border-solid-gray-200 bg-white p-6";

export function InterviewDemo({ initialCard }: { initialCard: Card }) {
  const [card, setCard] = useState(initialCard);
  const [session, setSession] = useState<SealedSession | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const [summary, setSummary] = useState("");
  const [vendor, setVendor] = useState<VendorRequest | null>(null);
  const [copied, setCopied] = useState(false);
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
    if (event.type === "item_finished") {
      setFinished(true);
      setSummary(event.summary);
      setVendor(event.vendor);
      setNote("");
    }
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
    return sendInterview({
      last_year_answer: SAMPLE_HOSPITAL.lastYearAnswer,
      vendor_answer: SAMPLE_HOSPITAL.vendorAnswer,
    });
  }

  async function copyQuestion() {
    if (!vendor) return;
    await navigator.clipboard.writeText(vendor.question);
    setCopied(true);
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
      const nextCard: Card = data.card;
      setResults(checked);
      setCard(nextCard);
      // 状態が変わった観点は、前の回答の理由を返事の読み取りに置き換える
      setReasons((current) => {
        const next = { ...current };
        for (const result of checked) {
          const viewpointId = vendor?.requirements.find((item) => item.id === result.requirement_id)?.viewpointId;
          const status = nextCard.viewpoints.find((item) => item.id === viewpointId)?.status;
          const changed =
            (result.result === "met" && status === "confirmed") || (result.result === "not_met" && status === "denied");
          if (viewpointId && changed) {
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
          <p role="alert" className="rounded-8 border-2 border-error-1 bg-white p-4 text-std-16B-170 text-error-1">
            {error}
          </p>
        )}

        {needsCode && (
          <form onSubmit={submitCode} className="flex flex-col gap-2">
            <label htmlFor="access-code" className={labelClass}>
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
          <div className={`flex flex-col gap-3 ${panelClass}`}>
            <h2 className="text-std-24B-150 text-solid-gray-900">サンプルで試す</h2>
            <p className="text-std-16N-170">
              {SAMPLE_HOSPITAL.name}の担当者になったつもりで、質問に答えてみてください。
              {SAMPLE_HOSPITAL.description}
            </p>
            <p className="text-std-16N-170 text-solid-gray-800">
              実際の病院の情報は入れないでください。回答はこの画面を閉じると消えます。
            </p>
            <button type="button" onClick={start} className={buttonClass}>
              サンプルで試す
            </button>
          </div>
        )}

        {busy && (
          <p aria-live="polite" className="text-std-16N-170">
            確認しています…
          </p>
        )}

        {canContinue && !busy && (
          <button type="button" onClick={() => sendInterview({ session })} className={buttonClass}>
            続ける
          </button>
        )}

        {question && !busy && (
          <form onSubmit={submitAnswer} className="flex flex-col gap-3">
            <p className="text-std-20B-150 text-solid-gray-900">{question.text}</p>
            <p className="rounded-8 bg-blue-50 p-4 text-std-16N-170 text-solid-gray-800">
              なぜこの質問？ {question.why}
            </p>
            {question.options.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswer(option)}
                    className="min-h-11 rounded-8 border border-blue-900 bg-white px-4 text-oln-16N-100 text-blue-900 hover:bg-blue-50 hover:underline focus-visible:focus-ring"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
            <label htmlFor="answer" className={labelClass}>
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

        {note && <p className="whitespace-pre-wrap text-std-16N-170">{note}</p>}

        {finished && summary && (
          <div className={`flex flex-col gap-2 ${panelClass}`}>
            <h2 className="text-std-24B-150 text-solid-gray-900">問診のまとめ</h2>
            <p className="whitespace-pre-wrap text-std-16N-170">{summary}</p>
          </div>
        )}

        {finished && !vendor && (
          <p className="text-std-16N-170">
            今回確認した観点では穴は見つかりませんでした。対策の準拠を保証するものではありません。
          </p>
        )}

        {vendor && (
          <form onSubmit={submitReply} className="flex flex-col gap-3 border-t border-solid-gray-200 pt-6">
            <h2 className="text-std-24B-150 text-solid-gray-900">ベンダーに確かめる</h2>
            <p className="text-std-16N-170">次の文章をベンダーへ送り、届いた返事を下に貼り付けてください。</p>
            <p className="whitespace-pre-wrap rounded-8 bg-solid-gray-50 p-4 text-std-16N-170">{vendor.question}</p>
            <button
              type="button"
              onClick={copyQuestion}
              className="min-h-11 w-fit rounded-8 border border-blue-900 bg-white px-4 text-oln-16N-100 text-blue-900 hover:bg-blue-50 hover:underline focus-visible:focus-ring"
            >
              {copied ? "コピーしました" : "質問文をコピーする"}
            </button>
            <label htmlFor="reply" className={labelClass}>
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
              <li key={result.requirement_id} className={panelClass}>
                <p className="text-std-18B-160">
                  {vendor?.requirements.find((item) => item.id === result.requirement_id)?.text}：
                  {RESULT_LABELS[result.result]}
                </p>
                {result.quote && (
                  <blockquote className="mt-2 border-l-4 border-solid-gray-420 pl-3 text-std-16N-170 text-solid-gray-800">
                    原文：{result.quote}
                  </blockquote>
                )}
                <p className="mt-2 text-std-16N-170">{result.plain}</p>
                {result.follow_up && <p className="mt-2 text-std-16N-170">追加の質問：{result.follow_up}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className={`flex flex-col gap-4 self-start ${panelClass}`} aria-label="判定">
        <div aria-live="polite">
          <p className="text-std-16N-170 text-solid-gray-800">バックアップと復旧（3-②）</p>
          <p className="text-std-32B-150 text-solid-gray-900">{card.label}</p>
        </div>
        <ul className="flex flex-col gap-3">
          {card.viewpoints.map((viewpoint) => (
            <li key={viewpoint.id} className="border-t border-solid-gray-200 pt-3 text-std-16N-170">
              <p className="text-std-16B-170">
                {viewpoint.name}：{STATUS_LABELS[viewpoint.status]}
              </p>
              {reasons[viewpoint.id] && <p>{reasons[viewpoint.id]}</p>}
              {viewpoint.status !== "not_asked" && (
                <p className="text-solid-gray-800">根拠：{viewpoint.evidence}</p>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
