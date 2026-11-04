import { statusLabel, type Card } from "@/lib/card";
import { countSteps, remainingSteps, type NextStepGroups } from "@/lib/result";
import type { VendorRequest } from "@/lib/session";
import { VERDICT_MEANINGS } from "@/lib/verdict";

const STEP_GROUPS = [
  { key: "free", title: "今日から院内でできること", short: "今日から院内でできること" },
  { key: "vendor", title: "ベンダーに聞くこと", short: "ベンダーに聞くこと" },
  { key: "budget", title: "予算を立てて検討すること（システムの入れ替えや、保守の契約の見直しのときに）", short: "予算を立てて検討すること" },
] as const;

// 「引き継ぐこと」で、分類ごとに文を載せる上限。1枚に収めるため、超えた分は「ほか n件」にまとめる
const HANDOVER_STEPS_SHOWN = 1;
const HANDOVER_QUESTIONS_SHOWN = 2;

// 節の見出し。2枚になるとき、見出しだけが1枚目の最後に取り残されないよう、直後の中身と離さない（break-after-avoid）
const HEADING = "mt-3 text-[12pt] font-bold break-after-avoid";
// 分類の小見出し（「今日から院内でできること」など）。直後の項目と離さない
const SUBHEADING = "font-bold break-after-avoid";
// 箇条書きの1項目と短い段落。文の途中で改ページしない
const ITEM = "break-inside-avoid";

// 分類ごとに「分類名：先頭の文。ほか n件。」の形にする（残りは上の「次にすること」で「済み」が付いていないもの）
function remainingLine(group: (typeof STEP_GROUPS)[number], steps: NextStepGroups[keyof NextStepGroups]): string {
  const shown = steps.slice(0, HANDOVER_STEPS_SHOWN).map((step) => step.text);
  const rest = steps.length - shown.length;
  return `${group.short}：${shown.join("／")}${rest > 0 ? `ほか${rest}件。` : ""}`;
}

// 残っていることの1行目。次にすることが元々ないときと、すべて済みのときを分ける
function remainingSummary(remainingCount: number, total: number): string {
  if (total === 0) return "残っていることはありません（今回確かめた範囲では、次にすることは出ていません）。";
  if (remainingCount === 0) return `残っていることはありません（次にすること ${total}件は、すべて済みです）。`;
  return `残っていること ${remainingCount}件（次にすること ${total}件のうち、済みでないもの）`;
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
// done は次にすることの「やった」印、vendor はベンダーへの質問（なければ null）。下のほうの「引き継ぐこと」で使う。
// 穴が4つで次にすることが12件のような長い場合は2枚になる。そのときも節の途中や文の途中で改ページしないよう、
// 短い節は節ごと（break-inside-avoid）、長くなりうる節（止まるおそれ、次にすること、根拠）は項目ごとに切れないようにし、
// 見出しは直後の中身と離さない。2枚目は節の見出しか項目の先頭から始まる
export function PrintSheet({ card, done = [], vendor = null }: { card: Card; done?: readonly string[]; vendor?: VendorRequest | null }) {
  const evidences = card.result.holes.flatMap((hole) =>
    card.viewpoints.filter((viewpoint) => viewpoint.id === hole.viewpointId),
  );
  const remaining = remainingSteps(card.result.nextSteps, done);
  const remainingCount = countSteps(remaining);
  const totalSteps = countSteps(card.result.nextSteps);
  const marked = new Set(done);
  const pending = pendingRequirements(card, vendor);
  const pendingShown = pending.slice(0, HANDOVER_QUESTIONS_SHOWN);

  return (
    <section id="print-sheet" className="hidden text-[10pt] leading-[1.5] text-black print:col-span-full print:block">
      {/* 題名、病院名の行、判定は1枚目の頭にまとめて置く。病院名と点検日の行は1枚目だけでよい */}
      <div className="break-inside-avoid">
        <h1 className="text-[16pt] font-bold">サイバー対策の点検結果（{card.itemName}）</h1>
        <p className="mt-2">
          病院名：＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿　点検日：＿＿＿＿年＿＿月＿＿日
        </p>

        <h2 className={HEADING}>判定：{card.label}</h2>
        {/* 判定の名前の意味（画面の判定カードと同じ固定の1文）。紙だけを見る人にも名前の意味が分かるように */}
        <p>{VERDICT_MEANINGS[card.verdict]}</p>
        {card.checkItems.map((checkItem) => (
          <p key={checkItem.no}>
            チェック項目 {checkItem.no}：{checkItem.text}
          </p>
        ))}
        {/* 1枚に収めるため、観点ごとの状態と確認の出どころは1段落にまとめる */}
        <p>
          確かめたこと：
          {card.viewpoints
            .map((viewpoint) => `${viewpoint.label}：${statusLabel(viewpoint.status, viewpoint.source)}`)
            .join("／")}
        </p>
      </div>

      <div>
        <h2 className={HEADING}>このままだと診療が止まるおそれがあるところ</h2>
        {card.result.holeCount === 0 ? (
          <p className={ITEM}>
            今回確かめた範囲では、診療が止まるおそれがあるところは見つかりませんでした。対策が基準を満たしていると保証するものではありません。
          </p>
        ) : (
          <ol className="list-decimal pl-6">
            {card.result.holes.map((hole) => (
              <li key={hole.viewpointId} className={ITEM}>
                {hole.label}：{hole.text}
              </li>
            ))}
          </ol>
        )}
      </div>

      {card.result.holeCount > 0 && (
        <div>
          <h2 className={HEADING}>次にすること</h2>
          {STEP_GROUPS.map((group) => (
            <div key={group.key}>
              <h3 className={SUBHEADING}>{group.title}</h3>
              {/* 画面で「やった」の印を付けたものは「済み：」を頭に付ける。紙でもどれが残りかが分かるように */}
              <ul className="list-disc pl-6">
                {card.result.nextSteps[group.key].map((step) => (
                  <li key={step.id} className={ITEM}>
                    {marked.has(step.id) ? "済み：" : ""}
                    {step.text}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {/* 直前の項目と離さない（この1文だけが2枚目の頭に来て、何の話か分からなくならないように） */}
          <p className={`${ITEM} break-before-avoid`}>費用の目安は示していません。必要かどうかと費用は、ベンダーに確かめてから決めます。</p>
        </div>
      )}

      <div>
        <h2 className={HEADING}>判定の根拠</h2>
        <ul className="list-disc pl-6">
          {(evidences.length > 0 ? evidences.map((item) => item.evidence) : [card.itemEvidence]).map((evidence) => (
            <li key={evidence.id} className={ITEM}>
              「{evidence.text}」（{evidence.source}）
            </li>
          ))}
        </ul>
      </div>

      {/* 担当が代わっても、どこまで進んだかが分かるように。1枚に収めるため、小さく、件数と先頭の文だけにする。
          この節と「位置づけ」は短いので、節ごと途中で切れないようにする */}
      <div className="break-inside-avoid">
        <h2 className={HEADING}>引き継ぐこと</h2>
        <ul className="list-disc pl-6 text-[9pt] leading-[1.5]">
          <li>
            {remainingSummary(remainingCount, totalSteps)}
            {remainingCount > 0 && (
              <ul className="list-[circle] pl-5">
                {STEP_GROUPS.filter((group) => remaining[group.key].length > 0).map((group) => (
                  <li key={group.key}>{remainingLine(group, remaining[group.key])}</li>
                ))}
              </ul>
            )}
          </li>
          <li>
            {/* 要件の文は「…取っている」のような言い切りなので、「かどうか」を添えて、できている事実と読まれないようにする */}
            {pending.length === 0
              ? "返事待ちの質問はありません。"
              : `返事待ち ${pending.length}件（ベンダーへの質問のうち、返事でまだ分かっていないこと）`}
            {pending.length > 0 && (
              <ul className="list-[circle] pl-5">
                {pendingShown.map((text) => (
                  <li key={text}>「{text}」かどうか</li>
                ))}
                {pending.length > pendingShown.length && <li>ほか{pending.length - pendingShown.length}件</li>}
              </ul>
            )}
          </li>
        </ul>
      </div>

      <div className="break-inside-avoid">
        <h2 className={HEADING}>この点検の位置づけ</h2>
        <ul className="list-disc pl-6">
          <li>事務の担当者の回答とベンダーの返事に基づく自己点検です。実地の確認ではありません。</li>
          <li>対策が基準を満たしていると保証するものではなく、法的な判断もしていません。</li>
          <li>{card.itemName}だけを確かめたもので、すべての対策を確かめたものではありません。</li>
          <li>
            根拠は厚生労働省の公開資料（チェックリスト、同マニュアル 令和8年度版、医療情報システムの安全管理に関するガイドライン
            第7.0版）からの引用です。厚生労働省が作成したものではありません。
          </li>
        </ul>
      </div>
    </section>
  );
}
