import type { Requirement } from "@/lib/quote";
import type { ViewpointId } from "@/lib/verdict";

// 根拠の本文は仮の文面。マニュアルの原文から固定データを作るときに差し替える。
export const BACKUP_ITEM = {
  id: "backup",
  name: "バックアップと復旧",
  checkItem: "3-②",
  firstQuestion: {
    id: "backup_q1",
    text: "バックアップは、誰が、どのくらいの頻度で取っていますか？",
    why: "まず、データの控えが本当に取られているかを確かめます。",
  },
  defaultEvidence: "仮の文面：控えがあっても、戻せなければ診療は再開できません。",
  viewpoints: [
    {
      id: "acquire",
      name: "取得",
      goal: "データの控えを定期的に取っている",
      evidence: "仮の文面：定期的に控えを取っていることが、復旧の出発点です。",
    },
    {
      id: "restore",
      name: "戻す確認",
      goal: "控えから実際に戻せることを確かめたことがある",
      evidence: "仮の文面：実際に戻してみるまで、控えが使えるとは言い切れません。",
    },
    {
      id: "isolate",
      name: "切り離し",
      goal: "控えが攻撃の届かない場所に分けて保管されている",
      evidence: "仮の文面：つながったままの控えは、攻撃で一緒に使えなくなることがあります。",
    },
    {
      id: "procedure",
      name: "手順",
      goal: "誰が何をすれば戻せるかが、手順として決まっている",
      evidence: "仮の文面：手順がなければ、非常時に戻す作業が止まります。",
    },
  ],
} as const satisfies {
  id: string;
  name: string;
  checkItem: string;
  firstQuestion: { id: string; text: string; why: string };
  defaultEvidence: string;
  viewpoints: { id: ViewpointId; name: string; goal: string; evidence: string }[];
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
