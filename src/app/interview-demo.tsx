"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { getItem, ITEMS, PLANNED_ITEMS } from "@/data/items";
import { SAMPLE_HOSPITAL, sampleDescription } from "@/data/sample";
import type { Evidence, FocusItem } from "@/data/types";
import { PrintSheet } from "./print-sheet";
import { buildCard, type Card } from "@/lib/card";
import { readItemAnswer, readVendorAnswer, type ExcelReading } from "@/lib/checklist-excel";
import { initialStates } from "@/lib/verdict";
import type { InterviewEvent } from "@/lib/interview";
import { detectPersonalInfo } from "@/lib/pii";
import type { ReadResult } from "@/lib/quote";
import { buildSaveFile } from "@/lib/save-file";
import type { InterviewSession, LastYearAnswer, SealedSession, VendorAnswer, VendorRequest } from "@/lib/session";

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
  "w-full rounded-8 border border-solid-gray-600 bg-white p-4 text-std-16N-170 text-solid-gray-900 placeholder:text-solid-gray-600 hover:border-black focus-visible:focus-ring";
const labelClass = "text-std-16B-170 text-solid-gray-800";
const panelClass = "rounded-12 border border-solid-gray-200 bg-white p-6";
const secondaryClass =
  "min-h-11 w-fit rounded-8 border border-blue-900 bg-white px-4 text-oln-16N-100 text-blue-900 hover:bg-blue-50 hover:underline focus-visible:focus-ring has-[:focus-visible]:focus-ring";

const STEP_GROUPS = [
  { key: "free", title: "今日、お金をかけずにできること" },
  { key: "vendor", title: "ベンダーに聞くこと" },
  { key: "budget", title: "お金がかかること（次にシステムを入れ替えるときに考える）" },
] as const;

type PersonalInfoWarning = { target: "answer" | "reply" | "term"; kinds: string[] };
type TermExchange = { question: string; answer: string };
type RecentReading = { viewpointId: string; status: keyof typeof STATUS_LABELS; reason: string };
// 画面が切り替わったあとに、キーボードと読み上げの焦点を移す先
type FocusTarget = "question" | "summary" | "reply" | "results" | "error";
// 返事の検証で状態が変わった観点。結果の下に出して、何が変わったかを示す
type ReplyChange = { viewpointId: string; name: string; before: keyof typeof STATUS_LABELS; after: keyof typeof STATUS_LABELS };

// 通信が止まったときに、画面が「確認しています」のままにならないようにする
const FETCH_TIMEOUT_MS = 90_000;

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
    <div className="flex flex-col gap-3 rounded-8 border-2 border-warning-yellow-1 bg-white p-4">
      <p role="alert" className="text-std-16B-170">
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
          ほかに、これまでの質問と回答、確かめたことの結果を送ります。病院名、読み込んだファイル、Excel の中身は送りません。送った内容はこのサイトに保存しません。
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

function checkItemNumbers(item: { checkItems: readonly { no: string }[] }): string {
  return item.checkItems.map((checkItem) => checkItem.no).join("、");
}

const VENDOR_LABELS: Record<VendorAnswer, string> = {
  yes: "はい",
  no: "いいえ",
  not_applicable: "対象外",
  no_item: "項目がない",
  unknown: "わからない（要確認）",
};

// 判定ごとの色。デジタル庁のデザイントークンの色だけを使い、文字は濃い灰色で読みやすさを保つ
const VERDICT_STYLES: Record<Card["verdict"], string> = {
  reviewing: "border-solid-gray-420 bg-solid-gray-50",
  confirmed_by_answer: "border-green-900 bg-green-50",
  paper_only: "border-yellow-900 bg-yellow-50",
  unknown: "border-solid-gray-800 bg-solid-gray-50",
  no: "border-red-900 bg-red-50",
};

// 判定の意味を、観点の状態からコードで組み立てる。Claude には作らせない
function verdictNote(card: Card, started: boolean): string {
  const primaryIds = getItem(card.itemId)?.primaryViewpoints ?? [];
  const primary = card.viewpoints.filter((viewpoint) => primaryIds.includes(viewpoint.id));
  const others = card.viewpoints.filter((viewpoint) => !primaryIds.includes(viewpoint.id));
  const names = (list: { name: string }[]) => list.map((viewpoint) => viewpoint.name).join("、");
  const denied = others.filter((viewpoint) => viewpoint.status === "denied");
  const unknown = others.filter((viewpoint) => viewpoint.status === "unknown");
  const parts: string[] = [];
  if (denied.length > 0) parts.push(`${names(denied)}ができていません`);
  if (unknown.length > 0) parts.push(`${names(unknown)}はわからないままです`);
  switch (card.verdict) {
    case "reviewing":
      return started
        ? "まだ確かめていない観点があります。回答に応じて変わります。"
        : "去年のチェックリストの回答です。問診を始めると、回答に応じて変わります。";
    case "confirmed_by_answer":
      return "すべての観点が回答で確認できました。実地の確認ではありません。";
    case "paper_only":
      return `${names(primary)}はできていますが、${parts.join("。")}。`;
    case "no":
      return `${names(primary)}ができていないため、「いいえ」になります。`;
    case "unknown":
      return `${names(primary)}ができているか分からないため、ベンダーに確かめる必要があります。`;
  }
}

// notice は、保証しないことやデータの扱いの注意書き。問診が始まったらたたんで、質問を上に出す
export function InterviewDemo({ initialCard, notice }: { initialCard: Card; notice: ReactNode }) {
  const [card, setCard] = useState(initialCard);
  const [itemId, setItemId] = useState(initialCard.itemId);
  const item: FocusItem = getItem(itemId) ?? ITEMS[0];
  const [session, setSession] = useState<SealedSession | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const [summary, setSummary] = useState("");
  const [vendor, setVendor] = useState<VendorRequest | null>(null);
  const [copied, setCopied] = useState<"question" | "followUp" | null>(null);
  const [reply, setReply] = useState("");
  const [results, setResults] = useState<ReadResult[]>([]);
  const [replyChanges, setReplyChanges] = useState<ReplyChange[]>([]);
  const [replyVerdict, setReplyVerdict] = useState<{ before: string; after: string } | null>(null);
  // 直前の強調が、問診の回答によるものか、ベンダーの返事によるものか
  const [recentSource, setRecentSource] = useState<"answer" | "reply">("answer");
  const [loadedNotice, setLoadedNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canContinue, setCanContinue] = useState(false);
  const [warning, setWarning] = useState<PersonalInfoWarning | null>(null);
  // 直前の回答から読み取った観点。左に一覧を出し、右のカードの同じ行を強調して、つながりを見せる
  const [recent, setRecent] = useState<RecentReading[]>([]);
  const [verdictChange, setVerdictChange] = useState<string | null>(null);
  const [termInput, setTermInput] = useState("");
  const [terms, setTerms] = useState<TermExchange[]>([]);
  const [termRemaining, setTermRemaining] = useState<number | null>(null);
  const [termBusy, setTermBusy] = useState(false);
  const [excel, setExcel] = useState<ExcelReading | null>(null);
  const [excelNotice, setExcelNotice] = useState("");
  const [excelAnswer, setExcelAnswer] = useState<LastYearAnswer>("unknown");
  const [excelVendor, setExcelVendor] = useState<VendorAnswer>("unknown");
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  // 待っている間の案内と、読み上げソフトに伝える短い文。どちらも常に置いた領域の文字だけを切り替える
  const [busyMessage, setBusyMessage] = useState("");
  const [live, setLive] = useState("");
  const [focusTarget, setFocusTarget] = useState<{ target: FocusTarget; seq: number } | null>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const recentRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  function requestFocus(target: FocusTarget) {
    // 同じ先に続けて移すときも効くよう、番号を進める
    setFocusTarget((current) => ({ target, seq: (current?.seq ?? 0) + 1 }));
  }

  // 画面が切り替わってから焦点を移す。見出しに移せば、次に何をするかが読み上げでも分かる
  useEffect(() => {
    if (!focusTarget) return;
    const refs = { question: questionRef, summary: summaryRef, reply: replyRef, results: resultsRef, error: errorRef };
    const element = refs[focusTarget.target].current;
    if (!element) return;
    element.focus({ preventScroll: true });
    // 次の質問の上には「直前の回答から読み取ったこと」が出るので、あればそこから見せる
    const top = focusTarget.target === "question" ? (recentRef.current ?? element) : element;
    top.scrollIntoView({ block: focusTarget.target === "error" ? "center" : "start" });
  }, [focusTarget]);

  function handleEvent(event: ServerEvent) {
    if (event.type === "question") {
      setQuestion(event);
      requestFocus("question");
    }
    if (event.type === "message") setNote(event.text);
    if (event.type === "can_continue") setCanContinue(true);
    if (event.type === "item_finished") {
      setFinished(true);
      setSummary(event.summary);
      setVendor(event.vendor);
      setNote("");
      requestFocus("summary");
    }
    if (event.type === "error") {
      setError(event.message);
      requestFocus("error");
    }
    if (event.type === "session") setSession(event.session);
    if (event.type === "verdict_updated") {
      setCard(event.card);
      setVerdictChange(event.card.label);
      setLive(`判定が「${event.card.label}」に変わりました。`);
    }
    if (event.type === "viewpoint_updated") {
      setCard(event.card);
      setReasons((current) => ({ ...current, [event.viewpointId]: event.reason }));
      setRecentSource("answer");
      setRecent((current) => [
        ...current.filter((item) => item.viewpointId !== event.viewpointId),
        { viewpointId: event.viewpointId, status: event.status, reason: event.reason },
      ]);
      const name = event.card.viewpoints.find((viewpoint) => viewpoint.id === event.viewpointId)?.name;
      setLive(`${name}：${STATUS_LABELS[event.status]}。${event.reason}`);
    }
  }

  function showError(message: string) {
    setError(message);
    requestFocus("error");
  }

  async function failFrom(response: Response) {
    const data = await response.json().catch(() => null);
    if (response.status === 401) setNeedsCode(true);
    showError(data?.error ?? "処理に失敗しました。もう一度ボタンを押してください。");
  }

  function postJson(path: string, body: BodyInit) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }

  const CONNECTION_ERROR = "接続できないか、時間がかかりすぎました。もう一度ボタンを押してください。";

  // 署名つきの状態が届いたときだけ成功とする。失敗したら画面を送信前に戻し、やり直せるようにする
  async function sendInterview(body: {
    session?: SealedSession | null;
    answer?: string;
    item_id?: string;
    last_year_answer?: LastYearAnswer;
    vendor_answer?: VendorAnswer;
  }) {
    const before = { question, card, reasons, recent, verdictChange };
    let received = false;
    let failed = false;
    setRecent([]);
    setVerdictChange(null);
    setBusy(true);
    setBusyMessage(
      body.answer
        ? "回答を読み取っています。10〜20秒ほどかかります…"
        : body.item_id
          ? "最初の質問を用意しています。10秒ほどかかります…"
          : "続きを確かめています…",
    );
    setError("");
    setQuestion(null);
    setCanContinue(false);
    try {
      const response = await postJson("/api/interview", JSON.stringify(body));
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
      if (!received && !failed) showError("処理が途中で止まりました。もう一度ボタンを押してください。");
      return received;
    } catch {
      showError(CONNECTION_ERROR);
      return false;
    } finally {
      if (!received) {
        setQuestion(before.question);
        setCard(before.card);
        setReasons(before.reasons);
        setRecent(before.recent);
        setVerdictChange(before.verdictChange);
      }
      setBusy(false);
    }
  }

  function chooseItem(id: string) {
    const chosen = getItem(id);
    if (!chosen) return;
    setItemId(id);
    setCard(buildCard(chosen, initialStates(chosen), chosen.sample.lastYearAnswer));
    // 読み取る項目が変わるので、Excel の結果は捨てる。黙って消さず、選び直しを促す
    if (excel) setExcelNotice("確かめる対策を変えたので、Excel を選び直してください。読み取る項目が変わります。");
    setExcel(null);
  }

  function start(
    lastYearAnswer: LastYearAnswer = item.sample.lastYearAnswer,
    vendorAnswer: VendorAnswer = item.sample.vendorAnswer,
  ) {
    setCard(buildCard(item, initialStates(item), lastYearAnswer));
    return sendInterview({ item_id: item.id, last_year_answer: lastYearAnswer, vendor_answer: vendorAnswer });
  }

  // Excel はこの画面の中だけで読み、サーバーへは送らない
  async function readExcel(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])];
    event.target.value = "";
    if (selected.length === 0) return;
    setError("");
    setExcelNotice("");
    if (selected.length > 2 || selected.some((file) => file.size > 5_000_000)) {
      showError("チェックリストの Excel を2つまで選んでください。1つ5MBまでです。");
      return;
    }
    try {
      const { default: readExcelFile } = await import("read-excel-file/browser");
      // 医療機関用と事業者用の2つを一緒に選べる
      const sheets = (await Promise.all(selected.map((file) => readExcelFile(file)))).flat();
      const reading = readItemAnswer(item, sheets);
      setExcel(reading);
      setExcelAnswer(reading.answer);
      // 事業者用の項目がなければ「項目がない」。事業者用のシートがなければ選んでもらう
      setExcelVendor(item.vendorCheckItem ? (readVendorAnswer(item, sheets)?.answer ?? "unknown") : "no_item");
    } catch {
      setExcel({ status: "not_found", answer: "unknown" });
      setExcelAnswer("unknown");
      setExcelVendor(item.vendorCheckItem ? "unknown" : "no_item");
    }
  }

  function saveResult() {
    if (!session) return;
    const file = buildSaveFile(JSON.parse(session.payload) as InterviewSession, reasons, summary);
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `サイバー問診_続きを再開するためのファイル_${file.savedAt.slice(0, 10)}.json`;
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
    setBusyMessage("保存したファイルを確かめています…");
    try {
      const text = await selected.text();
      const response = await postJson("/api/load-result", text);
      if (!response.ok) {
        await failFrom(response);
        return;
      }
      const data = await response.json();
      setSession(data.session);
      setItemId(data.card.itemId);
      setCard(data.card);
      setReasons(data.reasons);
      setSummary(data.summary);
      setVendor(data.vendor);
      setFinished(true);
      setResults([]);
      setReplyChanges([]);
      setReplyVerdict(null);
      // 保存した日は表示にだけ使う。形式はサーバーで確かめ済みだが、日付が読めなければ出さない
      const savedAt = new Date(String((JSON.parse(text) as { savedAt?: string }).savedAt ?? ""));
      const when = Number.isNaN(savedAt.getTime())
        ? "保存した結果"
        : `${savedAt.getMonth() + 1}月${savedAt.getDate()}日に保存した結果`;
      const next = data.vendor
        ? `${when}を読み込みました。ベンダーの返事を下に貼り付けてください。`
        : `${when}を読み込みました。ベンダーに聞くことはないので、返事を待つ必要はありません。`;
      setLoadedNotice(next);
      setLive(next);
      requestFocus(data.vendor ? "reply" : "summary");
    } catch {
      showError(CONNECTION_ERROR);
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, key: "question" | "followUp") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setLive("質問文をコピーしました。");
      setTimeout(() => setCopied(null), 3000);
    } catch {
      showError("コピーできませんでした。質問文を選んで、手でコピーしてください。");
    }
  }

  // 返事の追加の質問を、そのまま送れる1つの文にまとめる
  const followUpText = results
    .filter((result) => result.follow_up)
    .map((result, index) => `${index + 1}. ${result.follow_up}`)
    .join("\n");

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
      const response = await postJson("/api/ask-term", JSON.stringify({ session, question: termInput }));
      if (!response.ok) {
        await failFrom(response);
        return;
      }
      const data = await response.json();
      setTerms((current) => [...current, { question: termInput, answer: data.answer }]);
      setTermRemaining(data.remaining);
      setSession(data.session);
      setTermInput("");
      setLive(`ことばの相談の答え：${data.answer}`);
    } catch {
      showError(CONNECTION_ERROR);
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
    setBusyMessage("返事を読み取っています。10秒ほどかかります…");
    setError("");
    try {
      const response = await postJson("/api/verify-reply", JSON.stringify({ session, reply }));
      if (!response.ok) {
        await failFrom(response);
        return;
      }
      const data = await response.json();
      const checked: ReadResult[] = data.results;
      const nextCard: Card = data.card;
      setResults(checked);
      // 返事で状態が変わった観点を集め、結果の下と判定カードの強調に使う
      const changes: ReplyChange[] = nextCard.viewpoints.flatMap((viewpoint) => {
        const before = card.viewpoints.find((item) => item.id === viewpoint.id)?.status ?? "not_asked";
        return before === viewpoint.status
          ? []
          : [{ viewpointId: viewpoint.id, name: viewpoint.name, before, after: viewpoint.status }];
      });
      setReplyChanges(changes);
      setReplyVerdict(card.label === nextCard.label ? null : { before: card.label, after: nextCard.label });
      setCard(nextCard);
      // 状態が変わった観点は、前の回答の理由を返事の読み取りに置き換える
      const plainByViewpoint: Record<string, string> = {};
      for (const result of checked) {
        const viewpointId = vendor?.requirements.find((item) => item.id === result.requirement_id)?.viewpointId;
        const status = nextCard.viewpoints.find((item) => item.id === viewpointId)?.status;
        const changed =
          (result.result === "met" && status === "confirmed") || (result.result === "not_met" && status === "denied");
        if (viewpointId && changed) plainByViewpoint[viewpointId] = result.plain;
      }
      setReasons((current) => ({ ...current, ...plainByViewpoint }));
      setRecentSource("reply");
      setRecent(
        changes.map((change) => ({
          viewpointId: change.viewpointId,
          status: change.after,
          reason: plainByViewpoint[change.viewpointId] ?? "",
        })),
      );
      setSession(data.session);
      setLoadedNotice("");
      setLive(
        changes.length === 0
          ? "返事を読み取りました。観点の状態は変わりませんでした。"
          : `返事を読み取りました。${changes.map((change) => `${change.name}は${STATUS_LABELS[change.after]}`).join("、")}。`,
      );
      requestFocus("results");
    } catch {
      showError(CONNECTION_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="lg:col-span-2 print:hidden">
        {session ? (
          <details className="rounded-8 bg-solid-gray-50 px-4 py-3 text-std-16N-170 text-solid-gray-800">
            <summary className="cursor-pointer text-std-16B-170 focus-visible:focus-ring">
              このアプリについて（保証しないこと、入力してはいけないこと、データの扱い）
            </summary>
            <div className="mt-2">{notice}</div>
          </details>
        ) : (
          notice
        )}
      </div>

      <section className="flex flex-col gap-6 print:hidden" aria-label="問診とベンダーの返事">
        {error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-8 border-2 border-error-1 bg-white p-4 text-std-16B-170 text-error-1 focus-visible:focus-ring"
          >
            {error}
          </p>
        )}

        <p aria-live="polite" className={busy ? "text-std-16N-170" : "sr-only"}>
          {busy ? busyMessage : ""}
        </p>
        <p aria-live="polite" className="sr-only">
          {live}
        </p>

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
          <div className="flex flex-col gap-6">
            <section className={`flex flex-col gap-3 ${panelClass}`} aria-labelledby="start-sample">
              <h2 id="start-sample" className="text-std-24B-150 text-solid-gray-900">
                1. サンプルで試す
              </h2>
              <p className="text-std-16N-170">
                {SAMPLE_HOSPITAL.name}の担当者になったつもりで、質問に答えてみてください。
                {sampleDescription(item)}
              </p>
              <p className="text-std-16N-170 text-solid-gray-800">
                実際の病院の情報は入れないでください。回答はこの画面を閉じると消えます。
              </p>
              <button type="button" onClick={() => start()} className={buttonClass}>
                サンプルで試す
              </button>
              <details className="rounded-8 border border-solid-gray-200 p-3">
                <summary className="cursor-pointer text-std-16B-170 text-blue-900 underline focus-visible:focus-ring">
                  確かめる対策を変える（いまは「{item.name}」）
                </summary>
                <fieldset className="mt-3 flex flex-col gap-2">
                  <legend className="sr-only">確かめる対策</legend>
                  <p className="text-std-16N-170">
                    チェックリストのうち、診療が止まる原因になりやすい重点項目5つから選びます。攻撃の流れの順（入られる →
                    広がる → 戻せない → 止まる）に並んでいます。サンプルと Excel のどちらにも使います。
                  </p>
                  {ITEMS.map((choice) => (
                    <label
                      key={choice.id}
                      className="flex cursor-pointer items-start gap-3 rounded-8 border border-solid-gray-420 p-3 has-[:checked]:border-blue-900 has-[:checked]:bg-blue-50 has-[:focus-visible]:focus-ring"
                    >
                      <input
                        type="radio"
                        name="item"
                        value={choice.id}
                        checked={itemId === choice.id}
                        onChange={() => chooseItem(choice.id)}
                        className="mt-1.5 size-5 accent-blue-900"
                      />
                      <span className="text-std-16N-170">
                        <span className="text-std-16B-170">{choice.name}</span>（チェック項目 {checkItemNumbers(choice)}）
                        <br />
                        <span className="text-solid-gray-800">攻撃の流れ：{choice.stage}</span>
                      </span>
                    </label>
                  ))}
                  {PLANNED_ITEMS.map((planned) => (
                    <div
                      key={planned.id}
                      className="flex items-start justify-between gap-3 rounded-8 border border-dashed border-solid-gray-420 p-3 text-std-16N-170 text-solid-gray-800"
                    >
                      <span>
                        {planned.name}（チェック項目 {planned.checkItems.join("、")}）
                      </span>
                      <span className="whitespace-nowrap">今後の拡張</span>
                    </div>
                  ))}
                </fieldset>
              </details>
            </section>
            <section className={`flex flex-col gap-3 ${panelClass}`} aria-labelledby="start-excel">
              <h2 id="start-excel" className="text-std-24B-150 text-solid-gray-900">
                2. 去年のチェックリスト（Excel）から始める
              </h2>
              <p className="text-std-16N-170">
                医療機関用と事業者用の2つを一緒に選ぶと、ベンダーの回答も読み取ります。Excel
                はこの画面の中で読み、送るのは {checkItemNumbers(item)}（{item.name}）の回答だけです。
              </p>
              <label className={`flex cursor-pointer items-center justify-center ${secondaryClass}`}>
                Excel を読み込む
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  multiple
                  onChange={readExcel}
                  className="sr-only"
                />
              </label>
              {excelNotice && <p className="text-std-16N-170 text-solid-gray-800">{excelNotice}</p>}
              {excel && (
                <div className="flex flex-col gap-2 rounded-8 bg-solid-gray-50 p-4">
                  <p className="text-std-16N-170">
                    {excel.status === "read"
                      ? `${checkItemNumbers(item)} の去年の回答を読み取りました。違っていれば選び直してください。`
                      : `${checkItemNumbers(item)} の回答を読み取れませんでした（要確認）。去年の回答を選んでください。`}
                  </p>
                  <label htmlFor="last-year" className={labelClass}>
                    {checkItemNumbers(item)} の去年の回答
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
                  {item.vendorCheckItem && (
                    <>
                      <label htmlFor="vendor-answer" className={labelClass}>
                        事業者用チェックリスト {item.vendorCheckItem.no} の、ベンダーの回答
                      </label>
                      <select
                        id="vendor-answer"
                        value={excelVendor}
                        onChange={(event) => setExcelVendor(event.target.value as VendorAnswer)}
                        className={fieldClass}
                      >
                        {(["yes", "no", "not_applicable", "unknown"] as const).map((value) => (
                          <option key={value} value={value}>
                            {VENDOR_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  <button type="button" onClick={() => start(excelAnswer, excelVendor)} className={buttonClass}>
                    この回答で問診を始める
                  </button>
                </div>
              )}
            </section>
            <section className={`flex flex-col gap-3 ${panelClass}`} aria-labelledby="start-resume">
              <h2 id="start-resume" className="text-std-24B-150 text-solid-gray-900">
                3. 保存したファイルから続ける
              </h2>
              <p className="text-std-16N-170">
                ベンダーの返事が届いたら、前に保存した「続きを再開するためのファイル」を読み込んで、返事の確認から続けられます。
              </p>
              <label className={`flex cursor-pointer items-center justify-center ${secondaryClass}`}>
                続きを再開するためのファイルを読み込む
                <input type="file" accept="application/json,.json" onChange={loadResult} className="sr-only" />
              </label>
            </section>
          </div>
        )}

        {canContinue && !busy && (
          <button type="button" onClick={() => sendInterview({ session })} className={buttonClass}>
            続ける
          </button>
        )}

        {session && !finished && (recent.length > 0 || verdictChange) && !busy && (
          <section
            ref={recentRef}
            aria-label="直前の回答から読み取ったこと"
            className="flex flex-col gap-2 rounded-8 border-l-4 border-blue-900 bg-blue-50 p-4"
          >
            <h2 className="text-std-16B-170 text-blue-900">直前の回答から読み取ったこと（判定カードに反映）</h2>
            <ul className="flex flex-col gap-1 text-std-16N-170">
              {recent.map((item) => (
                <li key={item.viewpointId}>
                  <span className="text-std-16B-170">
                    {card.viewpoints.find((viewpoint) => viewpoint.id === item.viewpointId)?.name}：
                    {STATUS_LABELS[item.status]}
                  </span>
                  　{item.reason}
                </li>
              ))}
            </ul>
            {verdictChange && <p className="text-std-16B-170">判定が「{verdictChange}」に変わりました。</p>}
          </section>
        )}

        {question && !busy && (
          <h2 ref={questionRef} tabIndex={-1} className="text-std-20B-150 text-solid-gray-900 focus-visible:focus-ring">
            質問に答える
            <span className="ml-3 text-std-16N-170 text-solid-gray-800">
              確かめた観点 {card.viewpoints.filter((viewpoint) => viewpoint.status !== "not_asked").length}/
              {card.viewpoints.length}
            </span>
          </h2>
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
                    onClick={() => {
                      setAnswer(option);
                      answerRef.current?.focus();
                    }}
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
              ref={answerRef}
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
            <h2 ref={summaryRef} tabIndex={-1} className="text-std-24B-150 text-solid-gray-900 focus-visible:focus-ring">
              問診のまとめ
            </h2>
            {summary && <p className="text-std-16N-170">{summary}</p>}
            <table className="w-full border-collapse text-left text-std-16N-170">
              <thead>
                <tr className="border-b-2 border-solid-gray-420">
                  <th scope="col" className="py-2 pr-3 text-std-16B-170">確かめたこと</th>
                  <th scope="col" className="py-2 pr-3 text-std-16B-170">結果</th>
                  <th scope="col" className="py-2 text-std-16B-170">分かったこと</th>
                </tr>
              </thead>
              <tbody>
                {card.viewpoints.map((viewpoint) => (
                  <tr key={viewpoint.id} className="border-b border-solid-gray-200 align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">{viewpoint.name}</th>
                    <td className="py-2 pr-3">{STATUS_LABELS[viewpoint.status]}</td>
                    <td className="py-2">{reasons[viewpoint.id] ?? "―"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {finished && (
          <section className={`flex flex-col gap-4 ${panelClass}`} aria-label="診療が止まるおそれがあるところと次にすること">
            <h2 className="text-std-24B-150 text-solid-gray-900">このままだと診療が止まるおそれがあるところ</h2>
            {card.result.holeCount === 0 ? (
              <p className="text-std-16N-170">
                今回確かめた範囲では、診療が止まるおそれがあるところは見つかりませんでした。対策が基準を満たしていると保証するものではありません。
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
                    ほかに{card.result.holeCount - card.result.holes.length}件あります。
                  </p>
                )}
                <h3 className="text-std-20B-150 text-solid-gray-900">次にすること</h3>
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
                  金額はここでは示しません。いくらかかるか、本当に必要かは、ベンダーに聞いてから決めてください。
                </p>
              </>
            )}
          </section>
        )}

        {finished && (
          <section className={`flex flex-col gap-4 ${panelClass}`} aria-labelledby="flow-heading">
            <h2 id="flow-heading" className="text-std-24B-150 text-solid-gray-900">
              {vendor ? "この結果を使って、次の3つを順に行います" : "この結果を保存する、印刷する"}
            </h2>
            {vendor && (
              <p className="text-std-16N-170">
                ベンダーの返事は数日後に届くことが多いので、2 で保存してから画面を閉じて構いません。返事が届いたら、保存したファイルを読み込んで 3
                に進みます。
              </p>
            )}

            {vendor && (
              <div className="flex flex-col gap-2">
                <h3 className="text-std-20B-150 text-solid-gray-900">1. ベンダーに質問文を送る</h3>
                <p className="text-std-16N-170">次の文章を、メールなどでそのままベンダーへ送ってください。</p>
                <p className="whitespace-pre-wrap rounded-8 bg-solid-gray-50 p-4 text-std-16N-170">{vendor.question}</p>
                <button type="button" onClick={() => copyText(vendor.question, "question")} className={secondaryClass}>
                  {copied === "question" ? "コピーしました" : "質問文をコピーする"}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="text-std-20B-150 text-solid-gray-900">
                {vendor ? "2. 続きを再開するためのファイルを保存する" : "保存する、印刷する"}
              </h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={saveResult} className={secondaryClass}>
                  続きを再開するためのファイルを保存する
                </button>
                <button type="button" onClick={() => window.print()} className={secondaryClass}>
                  説明用の1枚を印刷する
                </button>
              </div>
              <p className="text-std-16N-170 text-solid-gray-800">
                保存するファイルは、このアプリにもう一度読み込んで、ベンダーの返事の確認から続けるためのものです。Excel や Word
                では開けません。人に見せるときは「説明用の1枚を印刷する」を使ってください。ファイルには病院の弱いところの情報が入るので、院外に持ち出さないでください。病院名は入りません。
              </p>
            </div>

            {vendor && (
              <form onSubmit={submitReply} className="flex flex-col gap-3">
                <h3 className="text-std-20B-150 text-solid-gray-900">3. 返事が届いたら、貼り付けて確かめる</h3>
                {loadedNotice && (
                  <p className="rounded-8 border-l-4 border-blue-900 bg-blue-50 p-4 text-std-16B-170 text-blue-900">
                    {loadedNotice}
                  </p>
                )}
                <label htmlFor="reply" className={labelClass}>
                  返事（4,000文字まで。病院名、担当者名、IP アドレスは消してください）
                </label>
                <textarea
                  id="reply"
                  ref={replyRef}
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
                    貼り付けた返事と、1
                    の質問文、確かめたいことを送ります。問診の回答、病院名、読み込んだファイルの中身は送りません。送った内容はこのサイトに保存しません。
                  </p>
                </details>
                <button type="submit" disabled={busy || !reply.trim()} className={buttonClass}>
                  返事を確かめる
                </button>
              </form>
            )}

            {results.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 ref={resultsRef} tabIndex={-1} className="text-std-20B-150 text-solid-gray-900 focus-visible:focus-ring">
                  返事を読み取った結果
                </h3>
                <ul className="flex flex-col gap-3">
                  {results.map((result) => (
                    <li key={result.requirement_id} className="rounded-8 border border-solid-gray-200 p-4">
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
                <section
                  aria-label="返事で変わったこと"
                  className="flex flex-col gap-2 rounded-8 border-l-4 border-blue-900 bg-blue-50 p-4"
                >
                  <h4 className="text-std-16B-170 text-blue-900">返事で変わったこと（判定カードと上の一覧に反映）</h4>
                  {replyChanges.length === 0 ? (
                    <p className="text-std-16N-170">観点の状態は変わりませんでした。返事で答えていない点は、追加の質問で確かめます。</p>
                  ) : (
                    <ul className="flex flex-col gap-1 text-std-16N-170">
                      {replyChanges.map((change) => (
                        <li key={change.viewpointId}>
                          <span className="text-std-16B-170">{change.name}</span>：{STATUS_LABELS[change.before]} →{" "}
                          {STATUS_LABELS[change.after]}
                        </li>
                      ))}
                    </ul>
                  )}
                  {replyVerdict && (
                    <p className="text-std-16B-170">
                      判定が「{replyVerdict.before}」から「{replyVerdict.after}」に変わりました。
                    </p>
                  )}
                </section>
                {followUpText && (
                  <div className="flex flex-col gap-2">
                    <p className="text-std-16B-170">追加でベンダーに聞く質問文</p>
                    <p className="whitespace-pre-wrap rounded-8 bg-solid-gray-50 p-4 text-std-16N-170">{followUpText}</p>
                    <button type="button" onClick={() => copyText(followUpText, "followUp")} className={secondaryClass}>
                      {copied === "followUp" ? "コピーしました" : "追加の質問文をコピーする"}
                    </button>
                  </div>
                )}
                <div className="flex flex-col gap-2 border-t border-solid-gray-200 pt-3">
                  <p className="text-std-16N-170">
                    返事を読み取った結果を残すには、もう一度ファイルを保存してください。前に保存したファイルは古い状態のままです。
                  </p>
                  <button type="button" onClick={saveResult} className={secondaryClass}>
                    続きを再開するためのファイルを保存する（返事を反映した状態）
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </section>

      <aside
        className={`flex flex-col gap-4 self-start print:hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto ${panelClass}`}
        aria-label="判定カード"
      >
        <p className="rounded-8 bg-solid-gray-50 px-3 py-2 text-std-16B-170 text-solid-gray-800">
          判定カード：回答から読み取った内容で、自動で更新されます
        </p>
        <div>
          <p className="text-std-16N-170 text-solid-gray-800">
            {card.itemName}（{checkItemNumbers(card)}）
          </p>
          <div className={`mt-2 rounded-8 border-l-8 px-4 py-3 ${VERDICT_STYLES[card.verdict]}`}>
            <p className="text-std-32B-150 text-solid-gray-900">{card.label}</p>
            <p className="mt-1 text-std-16N-170 text-solid-gray-900">{verdictNote(card, session !== null)}</p>
          </div>
          {card.checkItems.map((checkItem) => (
            <p key={checkItem.no} className="mt-2 text-std-16N-170 text-solid-gray-800">
              チェック項目 {checkItem.no}：{checkItem.text}
            </p>
          ))}
          {card.verdict !== "reviewing" && <EvidenceText evidence={card.itemEvidence} />}
        </div>
        <ul className="flex flex-col gap-3">
          {card.viewpoints.map((viewpoint) => (
            <li
              key={viewpoint.id}
              className={`border-t border-solid-gray-200 pt-3 text-std-16N-170 ${
                recent.some((item) => item.viewpointId === viewpoint.id)
                  ? "-mx-3 rounded-8 border-l-4 border-l-blue-900 bg-blue-50 px-3 pb-3"
                  : ""
              }`}
            >
              {recent.some((item) => item.viewpointId === viewpoint.id) && (
                <p className="text-std-16B-170 text-blue-900">
                  {recentSource === "reply" ? "ベンダーの返事で更新" : "いまの回答で更新"}
                </p>
              )}
              <p className="text-std-16B-170">
                {viewpoint.name}：{STATUS_LABELS[viewpoint.status]}
              </p>
              {reasons[viewpoint.id] && <p>{reasons[viewpoint.id]}</p>}
              {viewpoint.status !== "not_asked" && (
                // 根拠は長いので、直前に更新した観点だけ開く。ほかは観点の行が一目で見えるようにたたむ
                <details
                  key={`${viewpoint.id}-${recent.some((item) => item.viewpointId === viewpoint.id)}`}
                  open={recent.some((item) => item.viewpointId === viewpoint.id)}
                >
                  <summary className="cursor-pointer text-blue-900 underline focus-visible:focus-ring">根拠を見る</summary>
                  <EvidenceText evidence={viewpoint.evidence} />
                </details>
              )}
            </li>
          ))}
        </ul>
      </aside>

      {finished && <PrintSheet card={card} />}
    </div>
  );
}
