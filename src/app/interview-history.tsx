import { statusLabel, type Card } from "@/lib/card";
import type { HistoryEntry } from "@/lib/history";

// これまでの質問と回答。自分の答えを見返し、話の流れをたどるための一覧。
// ブラウザの中だけで持ち、サーバーへは送らず、保存ファイルにも、印刷用の1枚にも入れない。
// 文の中の用語は押せるようにしない。回答欄とことばの相談の間に置くので、Tab で止まる所を増やさないため
export function InterviewHistory({ entries, card, open }: { entries: HistoryEntry[]; card: Card; open: boolean }) {
  const nameOf = (viewpointId: string) =>
    card.viewpoints.find((viewpoint) => viewpoint.id === viewpointId)?.name ?? viewpointId;

  return (
    <details open={open} className="rounded-8 border border-solid-gray-200 p-3">
      <summary className="cursor-pointer text-std-16B-170 text-blue-900 underline focus-visible:focus-ring">
        これまでの質問と回答（{entries.length}件）
      </summary>
      <ol className="mt-3 flex list-decimal flex-col gap-3 pl-6 text-std-16N-170">
        {entries.map((entry, index) => (
          <li key={index} className="rounded-8 bg-solid-gray-50 p-3">
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
                  "この回答からは、読み取ったことがありませんでした。"
                ) : (
                  <ul className="flex flex-col gap-1">
                    {entry.readings.map((reading) => (
                      <li key={reading.viewpointId}>
                        <span className="text-std-16B-170">
                          {nameOf(reading.viewpointId)}：{statusLabel(reading.status)}
                        </span>
                        　{reading.reason}
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
