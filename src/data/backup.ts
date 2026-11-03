import type { Requirement } from "@/lib/quote";
import type { ViewpointId } from "@/lib/verdict";

export type Evidence = { id: string; text: string; source: string };

// 根拠は厚生労働省の公開資料の原文の引用。ページは資料に印刷された番号。
// 引用は PDF から取り出した原文と照合した（2026-11-03）
export const SOURCES = [
  {
    title: "医療機関・薬局におけるサイバーセキュリティ対策チェックリスト（令和8年度版）",
    url: "https://www.mhlw.go.jp/content/10808000/001716185.pdf",
  },
  {
    title: "医療機関・薬局におけるサイバーセキュリティ対策チェックリストマニュアル～医療機関・薬局・事業者向け～（令和8年度版）",
    url: "https://www.mhlw.go.jp/content/10808000/001716186.pdf",
  },
  {
    title: "医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
] as const;

const MANUAL = "チェックリストマニュアル（令和8年度版）";
const OPERATION = "安全管理ガイドライン 第7.0版 システム運用編";

export const BACKUP_ITEM = {
  id: "backup",
  name: "バックアップと復旧",
  checkItem: "3-②",
  checkItemText:
    "インシデント発生時に診療を継続するために必要な情報を検討し、バックアップを確保のうえ、復旧手順を確認している。",
  firstQuestion: {
    id: "backup_q1",
    text: "バックアップは、誰が、どのくらいの頻度で取っていますか？",
    why: "まず、データの控えが本当に取られているかを確かめます。",
    options: ["ベンダーが毎日取っている", "院内の担当者が取っている", "取っていない", "わからない"],
  },
  defaultEvidence: {
    id: "ev_backup",
    text: "非常時でも、稼働が損なわれた医療情報システムを復旧できるよう、情報システムやデータ等のバックアップを適切に確保し、その復旧手順を整備・確認しておくことが求められます。",
    source: `${MANUAL} 3-② 17ページ`,
  },
  viewpoints: [
    {
      id: "acquire",
      name: "取得",
      goal: "データの控えを定期的に取っている",
      evidence: {
        id: "ev_backup_acquire",
        text: "システム運用担当者は、企画管理者が運用管理規程等に定めたルールに基づいて、適切にバックアップを確保し、非常時に利用可能な状態で管理することが求められる。",
        source: `${OPERATION} 12.2 26ページ`,
      },
    },
    {
      id: "restore",
      name: "戻す確認",
      goal: "控えから実際に戻せることを確かめたことがある",
      evidence: {
        id: "ev_backup_restore",
        text: "（非常時に備えた対策として）…バックアップファイルの復旧テストなどを実施することが求められる。",
        source: `${OPERATION} 11.1 25ページ`,
      },
    },
    {
      id: "isolate",
      name: "切り離し",
      goal: "控えが攻撃の届かない場所に分けて保管されている",
      evidence: {
        id: "ev_backup_isolate",
        text: "バックアップデータの記録媒体を端末及びサーバ装置やネットワークから切り離して保管することが強く求められる。",
        source: `${OPERATION} 18.1 44ページ`,
      },
    },
    {
      id: "procedure",
      name: "手順",
      goal: "誰が何をすれば戻せるかが、手順として決まっている",
      evidence: {
        id: "ev_backup_procedure",
        text: "復旧するための手順をあらかじめ検討し、BCP として定めておくこと",
        source: `${OPERATION} 18.1 45ページ`,
      },
    },
  ],
} as const satisfies {
  id: string;
  name: string;
  checkItem: string;
  checkItemText: string;
  firstQuestion: { id: string; text: string; why: string; options: readonly string[] };
  defaultEvidence: Evidence;
  viewpoints: { id: ViewpointId; name: string; goal: string; evidence: Evidence }[];
};

export type NextSteps = { free: string; vendor: string; budget: string };

// 止まる穴の順位と次の一手。Claude には渡さず、コードが選ぶ。
// 順位は1が最も影響が大きい。費用の金額は示さない
export const BACKUP_RESULTS: Record<ViewpointId, { impactRank: number; hole: string; nextSteps: NextSteps }> = {
  acquire: {
    impactRank: 1,
    hole: "データの控えが取られていない、または取られているか分からない",
    nextSteps: {
      free: "バックアップの作業報告が届いているか、ベンダーからの報告書で確かめる",
      vendor: "どのデータを、どのくらいの頻度で控えているかを聞く",
      budget: "控えを取る仕組みがなければ、次のシステム更改で入れることを検討する",
    },
  },
  isolate: {
    impactRank: 2,
    hole: "控えが攻撃の届かない場所に分けられておらず、一緒に使えなくなるおそれがある",
    nextSteps: {
      free: "控えを保存している機器がどこにあり、ふだんつながったままかを院内で確かめる",
      vendor: "攻撃が届かない場所に分けて保管しているかを聞く",
      budget: "切り離した場所に保管する仕組みを、次のシステム更改で検討する",
    },
  },
  restore: {
    impactRank: 3,
    hole: "控えから実際に戻せるかを確かめていない",
    nextSteps: {
      free: "最後に戻す確認をした日を、作業報告や記録で探す",
      vendor: "戻す確認をしたことがあるか、次はいつできるかを聞く",
      budget: "定期的に戻す確認をする作業を、保守契約に入れることを検討する",
    },
  },
  procedure: {
    impactRank: 4,
    hole: "誰が何をすれば戻せるかが決まっていない",
    nextSteps: {
      free: "戻す手順の文書が院内にあるか、置き場所を確かめる",
      vendor: "戻す手順の文書を共有してもらえるかを聞く",
      budget: "手順書の作成や戻す訓練を、保守契約に入れることを検討する",
    },
  },
};

// 保存ファイルができるまでの、固定のサンプルの確認事項。
export const SAMPLE_VENDOR_QUESTION = {
  question:
    "バックアップについて、次の4点を教えてください。(1) 毎日取得していますか。(2) 実際に戻す確認をしたことはありますか。(3) 攻撃が届かない場所に分けて保管していますか。(4) 戻す手順は文書になっていますか。",
  requirements: [
    { id: "r_acquire", viewpointId: "acquire", text: "毎日取得している", followUp: "取得の頻度を教えてください。" },
    { id: "r_restore", viewpointId: "restore", text: "戻す確認をしたことがある", followUp: "最後に戻す確認をした日を教えてください。" },
    { id: "r_isolate", viewpointId: "isolate", text: "攻撃が届かない場所に分けて保管している", followUp: "控えの保管場所が、院内のネットワークから切り離されているか教えてください。" },
    { id: "r_procedure", viewpointId: "procedure", text: "戻す手順が文書になっている", followUp: "戻す手順の文書があるか教えてください。" },
  ] satisfies Requirement[],
};
