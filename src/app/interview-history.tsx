import { statusLabel, type Card } from "@/lib/card";
import type { HistoryEntry, HistoryReading } from "@/lib/history";

// これまでの質問と回答。自分の答えを見返し、話の流れをたどるための一覧。
// この画面の中だけで持ち、保存ファイルにも、印刷用の1枚にも入れない（AI には、問診の続きとして質問と回答を送っている）。
// 文の中の用語は押せるようにしない。長い一覧になるので、Tab で止まる所を増やさないため
export function InterviewHistory({ entries, card, open }: { entries: HistoryEntry[]; card: Card; open: boolean }) {
  const nameOf = (viewpointId: string) =>
    card.viewpoints.find((viewpoint) => viewpoint.id === viewpointId)?.name ?? viewpointId;

  return (
    <details open={open} className="rounded-8 border border-solid-gray-200 p-3">
      <summary className="cursor-pointer text-std-16B-170 text-blue-900 underline focus-visible:focus-ring">
        これまでの質問と回答（{entries.length}件）
      </summary>
      <p className="mt-2 text-std-16N-170 text-solid-gray-800">
        この一覧は、この画面にだけ残ります。保存するファイルにも、印刷する1枚にも入りません。画面を閉じると消えます。
      </p>
      <ol className="mt-3 flex list-decimal flex-col gap-3 pl-6 text-std-16N-170">
        {entries.map((entry, index) => (
          // 空白のない長い英数字（URL など）で横にはみ出さないよう、どこでも折り返せるようにする
          <li key={index} className="wrap-anywhere rounded-8 bg-solid-gray-50 p-3">
            <dl className="flex flex-col gap-1">
              <dt className="text-std-16B-170">質問</dt>
              <dd>
                {entry.question.text}
                <span className="block text-solid-gray-800">なぜこの質問？ {entry.question.why}</span>
              </dd>
              <dt className="mt-1 text-std-16B-170">回答</dt>
              <dd className="whitespace-pre-wrap">{entry.answer}</dd>
              <dt className="mt-1 text-std-16B-170">読み取ったこと</dt>
              <dd>
                {entry.readings === null ? (
                  "読み取っています"
                ) : entry.readings.length === 0 ? (
                  "この回答から読み取れたことは、ありませんでした。"
                ) : (
                  <ul className="flex flex-col gap-1">
                    {entry.readings.map((reading) => (
                      <li key={reading.viewpointId}>
                        <span className="text-std-16B-170">
                          {nameOf(reading.viewpointId)}：{statusLabel(reading.status)}
                        </span>
                        　{reading.reason}
                        <ReadingQuote reading={reading} current={index + 1} />
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </dl>
          </li>
        ))}
      </ol>
    </details>
  );
}

// 読み取りのもとになった回答の言葉。回答は信頼できないデータなので、文字としてだけ出す（React が文字として書き出す）。
// current は、この読み取りを付けた回の番号。言葉が前の回答にあったときは「n問目の回答の」と添える。
// 言葉がないとき（確かめられずに「わからない」にしたときなど）は何も出さない
export function ReadingQuote({ reading, current }: { reading?: HistoryReading; current: number }) {
  if (!reading?.quote) return null;
  const earlier = reading.quoteAnswer && reading.quoteAnswer !== current ? `${reading.quoteAnswer}問目の` : "";
  return (
    <span className="block wrap-anywhere text-solid-gray-800">
      {earlier}回答の『{reading.quote}』から読み取りました。
    </span>
  );
}
