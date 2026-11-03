"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Evidence } from "@/data/backup";
import { SAMPLE_HOSPITAL } from "@/data/sample";
import { PrintSheet } from "./print-sheet";
import { buildCard, type Card } from "@/lib/card";
import { readBackupAnswer, type ExcelReading } from "@/lib/checklist-excel";
import { initialStates } from "@/lib/verdict";
import type { InterviewEvent } from "@/lib/interview";
import { detectPersonalInfo } from "@/lib/pii";
import type { ReadResult } from "@/lib/quote";
import { buildSaveFile } from "@/lib/save-file";
import type { InterviewSession, LastYearAnswer, SealedSession, VendorRequest } from "@/lib/session";

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
const secondaryClass =
  "min-h-11 w-fit rounded-8 border border-blue-900 bg-white px-4 text-oln-16N-100 text-blue-900 hover:bg-blue-50 hover:underline focus-visible:focus-ring has-[:focus-visible]:focus-ring";

const STEP_GROUPS = [
  { key: "free", title: "今日、費用なしでできること" },
  { key: "vendor", title: "ベンダーに聞くこと" },
  { key: "budget", title: "予算が必要なこと（次のシステム更改などで検討）" },
] as const;

type PersonalInfoWarning = { target: "answer" | "reply" | "term"; kinds: string[] };
type TermExchange = { question: string; answer: string };

function WarningBox({
  warning,
  onSendAnyway,
  onRewrite,
}: {
  warning: PersonalInfoWarning;
  onSendAnyway: () => void;
  onRewrite: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-8 border-2 border-warning-yellow-1 bg-white p-4">
      <p className="text-std-16B-170">
        {warning.kinds.join("、")}のような情報が含まれているようです。
      </p>
      <p className="text-std-16N-170">
        病院や担当者、機器を特定できる情報は、消してから送ることをおすすめします。
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onRewrite} className={buttonClass}>
          書き直す
        </button>
        <button type="button" onClick={onSendAnyway} className={secondaryClass}>
          このまま送る
        </button>
      </div>
    </div>
  );
}

function SentContent({ label, text }: { label: string; text: string }) {
  return (
    <details className="text-std-16N-170 text-solid-gray-800">
      <summary className="cursor-pointer text-blue-900 underline focus-visible:focus-ring">AI に送る内容</summary>
      <div className="mt-2 flex flex-col gap-1 rounded-8 bg-solid-gray-50 p-4">
        <p>
          {label}：{text || "（まだ入力されていません）"}
        </p>
        <p>
          ほかに、これまでの質問と回答、観点の状態を送ります。病院名、読み込んだファイル、Excel の中身は送りません。送った内容はこのサイトに保存しません。
        </p>
      </div>
    </details>
  );
}

function EvidenceText({ evidence }: { evidence: Evidence }) {
  return (
    <p className="mt-1 text-std-16N-170 text-solid-gray-800">
      根拠：「{evidence.text}」（{evidence.source}）
    </p>
  );
}

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
  const [warning, setWarning] = useState<PersonalInfoWarning | null>(null);
  const [termInput, setTermInput] = useState("");
  const [terms, setTerms] = useState<TermExchange[]>([]);
  const [termRemaining, setTermRemaining] = useState<number | null>(null);
  const [termBusy, setTermBusy] = useState(false);
  const [excel, setExcel] = useState<ExcelReading | null>(null);
  const [excelAnswer, setExcelAnswer] = useState<LastYearAnswer>("unknown");
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

  function start(lastYearAnswer: LastYearAnswer = SAMPLE_HOSPITAL.lastYearAnswer) {
    setCard(buildCard(initialStates(), lastYearAnswer));
    // 事業者用チェックリストには 3-② に当たる項目がない
    return sendInterview({ last_year_answer: lastYearAnswer, vendor_answer: "no_item" });
  }

  // Excel はこの画面の中だけで読み、サーバーへは送らない
  async function readExcel(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    setError("");
    if (selected.size > 5_000_000) {
      setError("ファイルが大きすぎます。チェックリストの Excel を選んでください。");
      return;
    }
    try {
      const { default: readExcelFile } = await import("read-excel-file/browser");
      const reading = readBackupAnswer(await readExcelFile(selected));
      setExcel(reading);
      setExcelAnswer(reading.answer);
    } catch {
      setExcel({ status: "not_found", answer: "unknown" });
      setExcelAnswer("unknown");
    }
  }

  function saveResult() {
    if (!session) return;
    const file = buildSaveFile(JSON.parse(session.payload) as InterviewSession, reasons, summary);
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `問診の結果_${file.savedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function loadResult(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    setError("");
    if (selected.size > 64_000) {
      setError("このアプリで保存したファイルを選んでください。");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/load-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await selected.text(),
      });
      if (!response.ok) {
        await failFrom(response);
        return;
      }
      const data = await response.json();
      setSession(data.session);
      setCard(data.card);
      setReasons(data.reasons);
      setSummary(data.summary);
      setVendor(data.vendor);
      setFinished(true);
      setResults([]);
    } catch {
      setError("接続できませんでした。やり直してください。");
    } finally {
      setBusy(false);
    }
  }

  async function copyQuestion() {
    if (!vendor) return;
    await navigator.clipboard.writeText(vendor.question);
    setCopied(true);
  }

  // 個人や機器を特定できる形式があれば、送る前に止めて確かめてもらう
  function needsPersonalInfoCheck(text: string, target: PersonalInfoWarning["target"]): boolean {
    const kinds = detectPersonalInfo(text);
    if (kinds.length === 0) return false;
    setWarning({ target, kinds });
    return true;
  }

  async function sendAnswer(checked: boolean) {
    if (!checked && needsPersonalInfoCheck(answer, "answer")) return;
    setWarning(null);
    const sent = await sendInterview({ session, answer });
    if (sent) setAnswer("");
  }

  async function submitAnswer(event: FormEvent) {
    event.preventDefault();
    await sendAnswer(false);
  }

  function sendAnyway() {
    if (warning?.target === "answer") void sendAnswer(true);
    if (warning?.target === "reply") void sendReply(true);
    if (warning?.target === "term") void sendTerm(true);
  }

  // ことばの相談。判定には使わず、問診の流れとも分けて持つ
  async function sendTerm(checked: boolean) {
    if (!session || !termInput.trim()) return;
    if (!checked && needsPersonalInfoCheck(termInput, "term")) return;
    setWarning(null);
    setTermBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ask-term", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, question: termInput }),
      });
      if (!response.ok) {
        await failFrom(response);
        return;
      }
      const data = await response.json();
      setTerms((current) => [...current, { question: termInput, answer: data.answer }]);
      setTermRemaining(data.remaining);
      setSession(data.session);
      setTermInput("");
    } catch {
      setError("接続できませんでした。やり直してください。");
    } finally {
      setTermBusy(false);
    }
  }

  async function submitTerm(event: FormEvent) {
    event.preventDefault();
    await sendTerm(false);
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
    await sendReply(false);
  }

  async function sendReply(checked: boolean) {
    if (!checked && needsPersonalInfoCheck(reply, "reply")) return;
    setWarning(null);
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
            <button type="button" onClick={() => start()} className={buttonClass}>
              サンプルで試す
            </button>
            <div className="flex flex-col gap-2 border-t border-solid-gray-200 pt-4">
              <p className="text-std-16N-170">
                去年のチェックリスト（医療機関用の Excel）から始めることもできます。Excel はこの画面の中で読み、送るのは
                3-② の回答（はい／いいえ）だけです。
              </p>
              <label className={`flex cursor-pointer items-center justify-center ${secondaryClass}`}>
                Excel を読み込む
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={readExcel}
                  className="sr-only"
                />
              </label>
              {excel && (
                <div className="flex flex-col gap-2 rounded-8 bg-solid-gray-50 p-4">
                  <p className="text-std-16N-170">
                    {excel.status === "read"
                      ? "3-② の去年の回答を読み取りました。違っていれば選び直してください。"
                      : "3-② の回答を読み取れませんでした（要確認）。去年の回答を選んでください。"}
                  </p>
                  <label htmlFor="last-year" className={labelClass}>
                    3-② の去年の回答
                  </label>
                  <select
                    id="last-year"
                    value={excelAnswer}
                    onChange={(event) => setExcelAnswer(event.target.value as LastYearAnswer)}
                    className={fieldClass}
                  >
                    <option value="yes">はい</option>
                    <option value="no">いいえ</option>
                    <option value="unknown">わからない（要確認）</option>
                  </select>
                  <button type="button" onClick={() => start(excelAnswer)} className={buttonClass}>
                    この回答で問診を始める
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 border-t border-solid-gray-200 pt-4">
              <p className="text-std-16N-170">
                ベンダーの返事が届いたら、前に保存した結果を読み込んで続きから確かめられます。
              </p>
              <label className={`flex cursor-pointer items-center justify-center ${secondaryClass}`}>
                保存した結果を読み込む
                <input type="file" accept="application/json,.json" onChange={loadResult} className="sr-only" />
              </label>
            </div>
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
              onChange={(event) => {
                setAnswer(event.target.value);
                if (warning?.target === "answer") setWarning(null);
              }}
              className={fieldClass}
            />
            {warning?.target === "answer" && (
              <WarningBox warning={warning} onSendAnyway={sendAnyway} onRewrite={() => setWarning(null)} />
            )}
            <SentContent label="回答" text={answer} />
            <button type="submit" disabled={!answer.trim() || termBusy} className={buttonClass}>
              回答する
            </button>
          </form>
        )}

        {question && !busy && (
          <form onSubmit={submitTerm} className="flex flex-col gap-2 rounded-8 bg-solid-gray-50 p-4">
            <h2 className="text-std-18B-160 text-solid-gray-900">ことばの相談</h2>
            <p className="text-std-16N-170 text-solid-gray-800">
              質問の中に分からない言葉があれば聞いてください。判定には使いません。
              {termRemaining !== null && `（あと${termRemaining}回）`}
            </p>
            {terms.length > 0 && (
              <dl className="flex flex-col gap-2 text-std-16N-170">
                {terms.map((item, index) => (
                  <div key={index} className="rounded-8 bg-white p-3">
                    <dt className="text-std-16B-170">{item.question}</dt>
                    <dd className="mt-1 whitespace-pre-wrap">{item.answer}</dd>
                  </div>
                ))}
              </dl>
            )}
            <label htmlFor="term" className={labelClass}>
              聞きたいこと（500文字まで）
            </label>
            <input
              id="term"
              type="text"
              maxLength={500}
              value={termInput}
              placeholder="例：「バックアップ」とは何ですか？"
              onChange={(event) => {
                setTermInput(event.target.value);
                if (warning?.target === "term") setWarning(null);
              }}
              className={fieldClass}
            />
            {warning?.target === "term" && (
              <WarningBox warning={warning} onSendAnyway={sendAnyway} onRewrite={() => setWarning(null)} />
            )}
            <button
              type="submit"
              disabled={!termInput.trim() || termBusy || termRemaining === 0}
              className={secondaryClass}
            >
              {termBusy ? "調べています…" : "聞く"}
            </button>
          </form>
        )}

        {note && <p className="whitespace-pre-wrap text-std-16N-170">{note}</p>}

        {finished && (
          <section className={`flex flex-col gap-3 ${panelClass}`} aria-label="問診のまとめ">
            <h2 className="text-std-24B-150 text-solid-gray-900">問診のまとめ</h2>
            {summary && <p className="text-std-16N-170">{summary}</p>}
            <table className="w-full border-collapse text-left text-std-16N-170">
              <thead>
                <tr className="border-b-2 border-solid-gray-420">
                  <th scope="col" className="py-2 pr-3 text-std-16B-170">観点</th>
                  <th scope="col" className="py-2 pr-3 text-std-16B-170">状態</th>
                  <th scope="col" className="py-2 text-std-16B-170">分かったこと</th>
                </tr>
              </thead>
              <tbody>
                {card.viewpoints.map((viewpoint) => (
                  <tr key={viewpoint.id} className="border-b border-solid-gray-200 align-top">
                    <th scope="row" className="py-2 pr-3 font-normal whitespace-nowrap">{viewpoint.name}</th>
                    <td className="py-2 pr-3 whitespace-nowrap">{STATUS_LABELS[viewpoint.status]}</td>
                    <td className="py-2">{reasons[viewpoint.id] ?? "―"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {finished && (
          <section className={`flex flex-col gap-4 ${panelClass}`} aria-label="止まる穴と次の一手">
            <h2 className="text-std-24B-150 text-solid-gray-900">病院が止まる穴</h2>
            {card.result.holeCount === 0 ? (
              <p className="text-std-16N-170">
                今回確認した観点では穴は見つかりませんでした。対策の準拠を保証するものではありません。
              </p>
            ) : (
              <>
                <ol className="flex list-decimal flex-col gap-2 pl-6 text-std-16N-170">
                  {card.result.holes.map((hole) => (
                    <li key={hole.viewpointId}>
                      <span className="text-std-16B-170">{hole.name}</span>：{hole.text}
                    </li>
                  ))}
                </ol>
                {card.result.holeCount > card.result.holes.length && (
                  <p className="text-std-16N-170 text-solid-gray-800">
                    ほかに{card.result.holeCount - card.result.holes.length}件の穴があります。
                  </p>
                )}
                <h3 className="text-std-20B-150 text-solid-gray-900">次の一手</h3>
                {STEP_GROUPS.map((group) => (
                  <div key={group.key}>
                    <p className="text-std-16B-170">{group.title}</p>
                    <ul className="list-disc pl-6 text-std-16N-170">
                      {card.result.nextSteps[group.key].map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="text-std-16N-170 text-solid-gray-800">
                  費用の金額は示しません。金額や必要性は、ベンダーへの確認で決めてください。
                </p>
              </>
            )}
            <div className="flex flex-col gap-2 border-t border-solid-gray-200 pt-4">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={saveResult} className={secondaryClass}>
                  結果をファイルに保存する
                </button>
                <button type="button" onClick={() => window.print()} className={secondaryClass}>
                  説明用の1枚を印刷する
                </button>
              </div>
              <p className="text-std-16N-170 text-solid-gray-800">
                ファイルには病院の穴の情報が含まれます。院外に持ち出さないなど、取り扱いに注意してください。病院名は入りません。
              </p>
            </div>
          </section>
        )}

        {vendor && (
          <form onSubmit={submitReply} className="flex flex-col gap-3 border-t border-solid-gray-200 pt-6">
            <h2 className="text-std-24B-150 text-solid-gray-900">ベンダーに確かめる</h2>
            <p className="text-std-16N-170">次の文章をベンダーへ送り、届いた返事を下に貼り付けてください。</p>
            <p className="whitespace-pre-wrap rounded-8 bg-solid-gray-50 p-4 text-std-16N-170">{vendor.question}</p>
            <button type="button" onClick={copyQuestion} className={secondaryClass}>
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
              onChange={(event) => {
                setReply(event.target.value);
                if (warning?.target === "reply") setWarning(null);
              }}
              className={fieldClass}
            />
            {warning?.target === "reply" && (
              <WarningBox warning={warning} onSendAnyway={sendAnyway} onRewrite={() => setWarning(null)} />
            )}
            <details className="text-std-16N-170 text-solid-gray-800">
              <summary className="cursor-pointer text-blue-900 underline focus-visible:focus-ring">AI に送る内容</summary>
              <p className="mt-2 rounded-8 bg-solid-gray-50 p-4">
                貼り付けた返事と、上の確認事項の文、確かめる要件を送ります。問診の回答、病院名、読み込んだファイルの中身は送りません。送った内容はこのサイトに保存しません。
              </p>
            </details>
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
          <p className="mt-2 text-std-16N-170 text-solid-gray-800">チェック項目：{card.checkItemText}</p>
          {card.verdict !== "reviewing" && <EvidenceText evidence={card.itemEvidence} />}
        </div>
        <ul className="flex flex-col gap-3">
          {card.viewpoints.map((viewpoint) => (
            <li key={viewpoint.id} className="border-t border-solid-gray-200 pt-3 text-std-16N-170">
              <p className="text-std-16B-170">
                {viewpoint.name}：{STATUS_LABELS[viewpoint.status]}
              </p>
              {reasons[viewpoint.id] && <p>{reasons[viewpoint.id]}</p>}
              {viewpoint.status !== "not_asked" && <EvidenceText evidence={viewpoint.evidence} />}
            </li>
          ))}
        </ul>
      </aside>

      {finished && <PrintSheet card={card} />}
    </div>
  );
}
