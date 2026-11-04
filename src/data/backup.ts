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
      label: "バックアップを取る",
      goal: "データの控えを定期的に取っている",
      evidence: {
        id: "ev_backup_acquire",
        text: "システム運用担当者は、企画管理者が運用管理規程等に定めたルールに基づいて、適切にバックアップを確保し、非常時に利用可能な状態で管理することが求められる。",
        source: `${OPERATION} 12.2 26ページ`,
      },
      impactRank: 1,
      hole: "データのバックアップ（予備のコピー）が取られていないか、取られているか分かりません。システムが壊れると、データを戻せないおそれがあります。",
      nextSteps: {
        free: { id: "backup.acquire.free", text: "バックアップを取った記録が、ベンダーの作業報告などで届いているかを確かめます。" },
        vendor: { id: "backup.acquire.vendor", text: "どのデータのバックアップを、どのくらいの間隔で取っているかを聞きます。" },
        budget: { id: "backup.acquire.budget", text: "バックアップを取る仕組みがなければ、次にシステムを入れ替えるときに入れることを考えます。" },
      },
    },
    {
      id: "restore",
      name: "戻す確認",
      label: "バックアップから戻してみる",
      goal: "控えから実際に戻せることを確かめたことがある",
      evidence: {
        id: "ev_backup_restore",
        text: "（非常時に備えた対策として）…バックアップファイルの復旧テストなどを実施することが求められる。",
        source: `${OPERATION} 11.1 25ページ`,
      },
      impactRank: 3,
      hole: "バックアップから、実際にデータを戻せるかを試していません。いざというときに戻せないおそれがあります。",
      nextSteps: {
        free: { id: "backup.restore.free", text: "最後にバックアップから戻してみた日を、作業報告や記録で探します。" },
        vendor: { id: "backup.restore.vendor", text: "バックアップから戻してみたことがあるか、次はいつ試せるかを聞きます。" },
        budget: { id: "backup.restore.budget", text: "バックアップから戻してみる作業を、決まった間隔で行うよう、保守の契約に入れることを考えます。" },
      },
    },
    {
      id: "isolate",
      name: "切り離し",
      label: "バックアップを外して保管する",
      goal: "控えが攻撃の届かない場所に分けて保管されている",
      evidence: {
        id: "ev_backup_isolate",
        text: "バックアップデータの記録媒体を端末及びサーバ装置やネットワークから切り離して保管することが強く求められる。",
        source: `${OPERATION} 18.1 44ページ`,
      },
      impactRank: 2,
      hole: "バックアップが、ふだん使う機器につながったままです。攻撃されると、ふだん使うデータと一緒に、バックアップも壊されるおそれがあります。",
      nextSteps: {
        free: { id: "backup.isolate.free", text: "バックアップを保存している機器がどこにあり、ふだんつながったままかを、院内で確かめます。" },
        vendor: { id: "backup.isolate.vendor", text: "バックアップを、攻撃が届かない場所に分けて保管しているかを聞きます。" },
        budget: { id: "backup.isolate.budget", text: "ネットワークから切り離してバックアップを保管する仕組みを、次にシステムを入れ替えるときに考えます。" },
      },
    },
    {
      id: "procedure",
      name: "手順",
      label: "戻す手順を決めておく",
      goal: "誰が何をすれば戻せるかが、手順として決まっている",
      evidence: {
        id: "ev_backup_procedure",
        text: "復旧するための手順をあらかじめ検討し、BCP として定めておくこと",
        source: `${OPERATION} 18.1 45ページ`,
      },
      impactRank: 4,
      hole: "システムが止まったときに、誰が何をすればデータを戻せるかが決まっていません。戻すのに時間がかかるおそれがあります。",
      nextSteps: {
        free: { id: "backup.procedure.free", text: "データを戻す手順を書いた文書が院内にあるか、置き場所を確かめます。" },
        vendor: { id: "backup.procedure.vendor", text: "データを戻す手順を書いた文書を、病院にも渡してもらえるかを聞きます。" },
        budget: { id: "backup.procedure.budget", text: "手順書づくりや、戻す練習を、保守の契約に入れることを考えます。" },
      },
    },
  ],
  // 事業者用チェックリストには 3-② に当たる項目がない
  sample: { lastYearAnswer: "yes", vendorAnswer: "no_item" },
  photoHints: [
    "バックアップのソフトの履歴の画面（最後に成功した日時や、取る間隔が分かるもの）",
    "バックアップを保存している機器の写真（外付けのハードディスク、テープなど）",
    "ベンダーの作業報告書のうち、バックアップについて書かれたページ",
  ],
} as const satisfies FocusItem;
