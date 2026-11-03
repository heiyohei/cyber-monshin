import { statusLabel, type Card } from "@/lib/card";
import { countSteps, remainingSteps, type NextStepGroups } from "@/lib/result";
import type { VendorRequest } from "@/lib/session";

const STEP_GROUPS = [
  { key: "free", title: "今日から院内でできること", short: "今日から院内でできること" },
  { key: "vendor", title: "ベンダーに聞くこと", short: "ベンダーに聞くこと" },
  { key: "budget", title: "予算を立てて検討すること（システムの入れ替えや、保守の契約の見直しのときに）", short: "予算を立てて検討すること" },
] as const;

// 「引き継ぐこと」で、分類ごとに文を載せる上限。1枚に収めるため、超えた分は「ほか n件」にまとめる
const HANDOVER_STEPS_SHOWN = 1;
const HANDOVER_QUESTIONS_SHOWN = 2;

// 分類ごとに「分類名：先頭の文（ほか n件）」の形にする
function remainingLine(group: (typeof STEP_GROUPS)[number], steps: NextStepGroups[keyof NextStepGroups]): string {
  const shown = steps.slice(0, HANDOVER_STEPS_SHOWN).map((step) => step.text);
  const rest = steps.length - shown.length;
  return `${group.short}：${shown.join("／")}${rest > 0 ? `（ほか${rest}件）` : ""}`;
}

// 返事待ち：ベンダーへ聞いた要件のうち、返事でまだ決まっていない観点のもの
function pendingRequirements(card: Card, vendor: VendorRequest | null): string[] {
  if (!vendor) return [];
  const decidedByReply = new Set(
    card.viewpoints.filter((viewpoint) => viewpoint.source === "reply").map((viewpoint) => viewpoint.id),
  );
  return vendor.requirements
    .filter((requirement) => !decidedByReply.has(requirement.viewpointId))
    .map((requirement) => requirement.text);
}

// 院長や理事会への説明用の1枚。印刷のときだけ表示する。病院名は手で書き足す。
// done は次にすることの「やった」印、vendor はベンダーへの質問（なければ null）。下のほうの「引き継ぐこと」で使う
export function PrintSheet({ card, done = [], vendor = null }: { card: Card; done?: readonly string[]; vendor?: VendorRequest | null }) {
  const evidences = card.result.holes.flatMap((hole) =>
    card.viewpoints.filter((viewpoint) => viewpoint.id === hole.viewpointId),
  );
  const remaining = remainingSteps(card.result.nextSteps, done);
  const remainingCount = countSteps(remaining);
  const pending = pendingRequirements(card, vendor);
  const pendingShown = pending.slice(0, HANDOVER_QUESTIONS_SHOWN);

  return (
    <section id="print-sheet" className="hidden text-[10pt] leading-[1.5] text-black print:block">
      <h1 className="text-[16pt] font-bold">サイバー対策の点検結果（{card.itemName}）</h1>
      <p className="mt-2">
        病院名：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿　点検日：＿＿＿＿年＿＿月＿＿日
      </p>

      <h2 className="mt-3 text-[12pt] font-bold">判定：{card.label}</h2>
      {card.checkItems.map((checkItem) => (
        <p key={checkItem.no}>
          チェック項目 {checkItem.no}：{checkItem.text}
        </p>
      ))}
      {/* 1枚に収めるため、観点ごとの状態と確認の出どころは1段落にまとめる */}
      <p>
        確かめたこと：
        {card.viewpoints
          .map((viewpoint) => `${viewpoint.name}　${statusLabel(viewpoint.status, viewpoint.source)}`)
          .join("／")}
      </p>

      <h2 className="mt-3 text-[12pt] font-bold">このままだと診療が止まるおそれがあるところ</h2>
      {card.result.holeCount === 0 ? (
        <p>今回確かめた範囲では、診療が止まるおそれがあるところは見つかりませんでした。対策が基準を満たしていると保証するものではありません。</p>
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
          <h2 className="mt-3 text-[12pt] font-bold">次にすること</h2>
          {STEP_GROUPS.map((group) => (
            <div key={group.key}>
              <p className="font-bold">{group.title}</p>
              <ul className="list-disc pl-6">
                {card.result.nextSteps[group.key].map((step) => (
                  <li key={step.id}>{step.text}</li>
                ))}
              </ul>
            </div>
          ))}
          <p>費用の目安は示していません。必要かどうかと費用は、ベンダーに確かめてから決めます。</p>
        </>
      )}

      <h2 className="mt-3 text-[12pt] font-bold">判定の根拠</h2>
      <ul className="list-disc pl-6">
        {(evidences.length > 0 ? evidences.map((item) => item.evidence) : [card.itemEvidence]).map((evidence) => (
          <li key={evidence.id}>
            「{evidence.text}」（{evidence.source}）
          </li>
        ))}
      </ul>

      {/* 担当が代わっても、どこまで進んだかが分かるように。1枚に収めるため、小さく、件数と先頭の文だけにする */}
      <h2 className="mt-3 text-[12pt] font-bold">引き継ぐこと</h2>
      <ul className="list-disc pl-6 text-[9pt] leading-[1.5]">
        <li>
          {remainingCount === 0
            ? "残っていることはありません。次にすることは、すべて「やった」の印が付いています。"
            : `残っていること ${remainingCount}件（「やった」の印がない次にすること）`}
          {remainingCount > 0 && (
            <ul className="list-[circle] pl-5">
              {STEP_GROUPS.filter((group) => remaining[group.key].length > 0).map((group) => (
                <li key={group.key}>{remainingLine(group, remaining[group.key])}</li>
              ))}
            </ul>
          )}
        </li>
        <li>
          {pending.length === 0
            ? "返事待ちの質問はありません。"
            : `返事待ち ${pending.length}件（ベンダーに聞いたうち、返事でまだ決まっていないこと）：${pendingShown.join("／")}${pending.length > pendingShown.length ? `（ほか${pending.length - pendingShown.length}件）` : ""}`}
        </li>
      </ul>

      <h2 className="mt-3 text-[12pt] font-bold">この点検の位置づけ</h2>
      <ul className="list-disc pl-6">
        <li>事務の担当者の回答とベンダーの返事に基づく自己点検です。実地の確認ではありません。</li>
        <li>対策が基準を満たしていると保証するものではなく、法的な判断もしていません。</li>
        <li>{card.itemName}だけを確かめたもので、すべての対策を確かめたものではありません。</li>
        <li>
          根拠は厚生労働省の公開資料（チェックリスト、同マニュアル 令和8年度版、医療情報システムの安全管理に関するガイドライン
          第7.0版）からの引用です。厚生労働省が作成したものではありません。
        </li>
      </ul>
    </section>
  );
}
