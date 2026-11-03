"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { splitByTerms } from "@/lib/glossary";

// 用語のボタン。文の中に置くので、文字の大きさと太さは周りの文に合わせ、点線の下線と色で押せることを示す。
// マウスを乗せたときだけ出る説明（ツールチップ）は使わない
const termClass =
  "cursor-pointer rounded-4 text-blue-900 underline decoration-dotted decoration-2 underline-offset-4 hover:bg-blue-50 focus-visible:focus-ring";
const boxButtonClass =
  "min-h-11 rounded-8 border border-blue-900 bg-white px-3 text-oln-14N-100 text-blue-900 hover:bg-blue-50 hover:underline focus-visible:focus-ring";

// 文の中の用語（src/data/terms.ts）を押せるようにし、押すとその文のすぐ下に短い説明の箱を開く。
// 原文の文字は変えず、印を付けるだけ。説明は固定データからで、Claude は使わない。
// <p> の中に置けるよう、箱も span（block）で作る。prefix と suffix は、用語に印を付けない前後の文字（「根拠：「」など）
export function TermText({
  text,
  prefix,
  suffix,
  onAskMore,
}: {
  text: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  // 問診の途中なら、ことばの相談の入力欄にその用語を入れる。途中でなければ渡さない（ボタンを出さない）
  onAskMore?: (term: string) => void;
}) {
  const boxId = `${useId()}-term`;
  const [open, setOpen] = useState<number | null>(null);
  // 「閉じる」で閉じたあと、焦点を押した用語のボタンへ戻す
  const openButtonRef = useRef<HTMLButtonElement | null>(null);
  const parts = splitByTerms(text);
  const current = open === null ? null : parts[open];

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
            aria-expanded={open === index}
            aria-controls={boxId}
            onClick={(event) => {
              openButtonRef.current = event.currentTarget;
              setOpen(open === index ? null : index);
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
        hidden={current === null}
        className="mt-2 mb-1 block rounded-8 border border-blue-900 bg-blue-50 p-3 text-std-16N-170 text-solid-gray-900"
      >
        {current?.type === "term" && (
          <>
            <span className="block text-std-16B-170">{current.text}</span>
            {current.text !== current.entry.term && (
              <span className="block text-solid-gray-800">「{current.entry.term}」と同じ意味です</span>
            )}
            <span className="block">{current.entry.short}</span>
            <span className="mt-2 flex flex-wrap gap-2">
              {onAskMore && (
                <button type="button" onClick={() => onAskMore(current.text)} className={boxButtonClass}>
                  もっと詳しく聞く（ことばの相談）
                </button>
              )}
              <button type="button" onClick={close} className={boxButtonClass}>
                閉じる
              </button>
            </span>
          </>
        )}
      </span>
    </>
  );
}
