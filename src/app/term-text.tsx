"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { splitByTerms } from "@/lib/glossary";

// 用語のボタン。文の中に置くので、文字の大きさと太さは周りの文に合わせ、点線の下線と色で押せることを示す。
// マウスを乗せたときだけ出る説明（ツールチップ）は使わない
const termClass =
  "cursor-pointer rounded-4 text-blue-900 underline decoration-dotted decoration-2 underline-offset-4 hover:bg-blue-50 focus-visible:focus-ring";
// 箱の中のボタン。ほかの画面の2番目のボタン（secondaryClass）と同じ 16px
const boxButtonClass =
  "min-h-11 rounded-8 border border-blue-900 bg-white px-4 text-oln-16N-100 text-blue-900 hover:bg-blue-50 hover:underline focus-visible:focus-ring";

// 「サーバ」と「サーバー」、「切り離して」と「切り離し」のような表記や活用の違いなら、用語を並べて出さない
function sameWord(a: string, b: string): boolean {
  const x = a.replace(/\s+/g, "");
  const y = b.replace(/\s+/g, "");
  return x.includes(y) || y.includes(x);
}

// 文の中の用語（src/data/terms.ts）を押せるようにし、押すとその文のすぐ下に短い説明の箱を開く。
// 原文の文字は変えず、印を付けるだけ。説明は固定データからで、Claude は使わない。
// <p> の中に置けるよう、箱も span（block）で作る。prefix と suffix は、用語に印を付けない前後の文字（「根拠：「」など）
export function TermText({
  text,
  prefix,
  suffix,
  onAskMore,
  selectableBox = true,
}: {
  text: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  // 問診の途中なら、ことばの相談の入力欄にその用語を入れる。途中でなければ渡さない（ボタンを出さない）
  onAskMore?: (term: string) => void;
  // false なら、説明の箱の文字を選べないようにする。そのままコピーして送る文（ベンダーへの質問文）に、説明が混ざらないように
  selectableBox?: boolean;
}) {
  const boxId = `${useId()}-term`;
  // 開いている用語は、文とその中の位置で覚える。文が変わったら（別の保存ファイルの読み込みなど）閉じた扱いにする
  const [open, setOpen] = useState<{ text: string; index: number } | null>(null);
  // 「閉じる」で閉じたあと、焦点を押した用語のボタンへ戻す
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const parts = splitByTerms(text);
  const opened = open && open.text === text ? parts[open.index] : undefined;
  const current = opened?.type === "term" ? opened : null;

  if (!parts.some((part) => part.type === "term")) {
    return (
      <>
        {prefix}
        {text}
        {suffix}
      </>
    );
  }

  function close() {
    setOpen(null);
    openButtonRef.current?.focus();
  }

  return (
    <>
      {prefix}
      {parts.map((part, index) =>
        part.type === "text" ? (
          part.text
        ) : (
          <button
            key={index}
            type="button"
            aria-expanded={current !== null && open?.index === index}
            aria-controls={boxId}
            onClick={(event) => {
              openButtonRef.current = event.currentTarget;
              setOpen(current !== null && open?.index === index ? null : { text, index });
            }}
            className={termClass}
          >
            {part.text}
          </button>
        ),
      )}
      {suffix}
      <span
        id={boxId}
        role="group"
        aria-label={current ? `「${current.text}」の説明` : undefined}
        hidden={current === null}
        className={`mt-2 mb-1 block rounded-8 border border-blue-900 bg-blue-50 p-3 text-std-16N-170 text-solid-gray-900 ${
          selectableBox ? "" : "select-none"
        }`}
      >
        {current && (
          <>
            <span className="block text-std-16B-170">
              {current.text}
              {!sameWord(current.text, current.entry.term) && `（${current.entry.term}）`}
            </span>
            <span className="block">{current.entry.short}</span>
            {/* 厚生労働省の原文のすぐ下に出るので、誰が書いた文かを示す */}
            <span className="block text-dns-14N-130 text-solid-gray-800">
              このアプリで作った説明で、厚生労働省の資料の文ではありません
            </span>
            <span className="mt-2 flex flex-wrap gap-2">
              {onAskMore && (
                <button type="button" onClick={() => onAskMore(current.text)} className={boxButtonClass}>
                  ことばの相談で詳しく聞く
                </button>
              )}
              <button type="button" onClick={close} className={boxButtonClass}>
                閉じる<span className="sr-only">（「{current.text}」の説明）</span>
              </button>
            </span>
          </>
        )}
      </span>
    </>
  );
}

// 何行かある文（ベンダーへの質問文など）の用語に印を付ける。行ごとに TermText にし、説明の箱はその行のすぐ下に開く。
// 空の行は、行の間の空きとして残す。コピーするときは元の文字列を使い、説明の箱の文字は混ぜない
export function TermLines({ text, onAskMore }: { text: string; onAskMore?: (term: string) => void }) {
  return (
    <>
      {text.split("\n").map((line, index) =>
        line.trim() === "" ? (
          <span key={index} className="block h-4" aria-hidden="true" />
        ) : (
          <span key={index} className="block">
            <TermText text={line} onAskMore={onAskMore} selectableBox={false} />
          </span>
        ),
      )}
    </>
  );
}
