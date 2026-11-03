import type { Card } from "@/lib/card";

const STEP_GROUPS = [
  { key: "free", title: "今日、費用なしでできること" },
  { key: "vendor", title: "ベンダーに聞くこと" },
  { key: "budget", title: "予算が必要なこと" },
] as const;

// 院長や理事会への説明用の1枚。印刷のときだけ表示する。病院名は手で書き足す
export function PrintSheet({ card }: { card: Card }) {
  const evidences = card.result.holes.flatMap((hole) =>
    card.viewpoints.filter((viewpoint) => viewpoint.id === hole.viewpointId),
  );

  return (
    <section id="print-sheet" className="hidden text-[10.5pt] leading-[1.6] text-black print:block">
      <h1 className="text-[16pt] font-bold">サイバー対策の点検結果（{card.itemName}）</h1>
      <p className="mt-2">
        病院名：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿　点検日：＿＿＿＿年＿＿月＿＿日
      </p>

      <h2 className="mt-4 text-[12pt] font-bold">判定：{card.label}</h2>
      {card.checkItems.map((checkItem) => (
        <p key={checkItem.no}>
          チェック項目 {checkItem.no}：{checkItem.text}
        </p>
      ))}

      <h2 className="mt-4 text-[12pt] font-bold">病院が止まる穴</h2>
      {card.result.holeCount === 0 ? (
        <p>今回確認した観点では穴は見つかりませんでした。対策の準拠を保証するものではありません。</p>
      ) : (
        <ol className="list-decimal pl-6">
          {card.result.holes.map((hole) => (
            <li key={hole.viewpointId}>
              {hole.name}：{hole.text}
            </li>
          ))}
        </ol>
      )}

      {card.result.holeCount > 0 && (
        <>
          <h2 className="mt-4 text-[12pt] font-bold">次の一手</h2>
          {STEP_GROUPS.map((group) => (
            <div key={group.key}>
              <p className="font-bold">{group.title}</p>
              <ul className="list-disc pl-6">
                {card.result.nextSteps[group.key].map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
          ))}
          <p>費用の金額は示していません。金額や必要性は、ベンダーへの確認で決めます。</p>
        </>
      )}

      <h2 className="mt-4 text-[12pt] font-bold">判定の根拠</h2>
      <ul className="list-disc pl-6">
        {(evidences.length > 0 ? evidences.map((item) => item.evidence) : [card.itemEvidence]).map((evidence) => (
          <li key={evidence.id}>
            「{evidence.text}」（{evidence.source}）
          </li>
        ))}
      </ul>

      <h2 className="mt-4 text-[12pt] font-bold">この点検の位置づけ</h2>
      <ul className="list-disc pl-6">
        <li>事務の担当者の回答とベンダーの返事に基づく自己点検です。実地の確認ではありません。</li>
        <li>対策の準拠を保証するものではなく、法的な判断もしていません。</li>
        <li>{card.itemName}だけを確かめたもので、すべての対策を確かめたものではありません。</li>
        <li>
          根拠は厚生労働省の公開資料（チェックリスト、同マニュアル 令和8年度版、医療情報システムの安全管理に関するガイドライン
          第7.0版）からの引用です。厚生労働省が作成したものではありません。
        </li>
      </ul>
    </section>
  );
}
