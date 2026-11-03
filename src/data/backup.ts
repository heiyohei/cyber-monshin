import { MANUAL, OPERATION } from "./sources.ts";
import type { FocusItem } from "./types.ts";

export const BACKUP_ITEM = {
  id: "backup",
  name: "バックアップと復旧",
  stage: "戻せない",
  checkItems: [
    {
      no: "3-②",
      text: "インシデント発生時に診療を継続するために必要な情報を検討し、バックアップを確保のうえ、復旧手順を確認している。",
      keywords: ["バックアップ", "復旧手順"],
    },
  ],
  vendorCheckItem: null,
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
  primaryViewpoints: ["acquire"],
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
      impactRank: 1,
      hole: "データの控えが取られていない、または取られているか分からない",
      nextSteps: {
        free: "バックアップの作業報告が届いているか、ベンダーからの報告書で確かめる",
        vendor: "どのデータを、どのくらいの頻度で控えているかを聞く",
        budget: "控えを取る仕組みがなければ、次のシステム更改で入れることを検討する",
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
      impactRank: 3,
      hole: "控えから実際に戻せるかを確かめていない",
      nextSteps: {
        free: "最後に戻す確認をした日を、作業報告や記録で探す",
        vendor: "戻す確認をしたことがあるか、次はいつできるかを聞く",
        budget: "定期的に戻す確認をする作業を、保守契約に入れることを検討する",
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
      impactRank: 2,
      hole: "控えが攻撃の届かない場所に分けられておらず、一緒に使えなくなるおそれがある",
      nextSteps: {
        free: "控えを保存している機器がどこにあり、ふだんつながったままかを院内で確かめる",
        vendor: "攻撃が届かない場所に分けて保管しているかを聞く",
        budget: "切り離した場所に保管する仕組みを、次のシステム更改で検討する",
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
      impactRank: 4,
      hole: "誰が何をすれば戻せるかが決まっていない",
      nextSteps: {
        free: "戻す手順の文書が院内にあるか、置き場所を確かめる",
        vendor: "戻す手順の文書を共有してもらえるかを聞く",
        budget: "手順書の作成や戻す訓練を、保守契約に入れることを検討する",
      },
    },
  ],
  // 事業者用チェックリストには 3-② に当たる項目がない
  sample: { lastYearAnswer: "yes", vendorAnswer: "no_item" },
} as const satisfies FocusItem;
