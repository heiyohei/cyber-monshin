import type { ViewpointStatus } from "../src/lib/verdict.ts";

// 事務職員役の人物。知っていること（本当の状態）と話し方の癖を持つ。実在の人や病院ではない。
// 回答の文は台本にせず、エージェントが知っていることから自分で作る
export type ClerkPersona = {
  id: string;
  name: string;
  itemId: string;
  facts: string[];
  style: string[];
  expected: Record<string, ViewpointStatus>;
};

export const PERSONAS: ClerkPersona[] = [
  {
    id: "quiet_vendor",
    name: "口数が少なく、ベンダー任せ",
    itemId: "backup",
    facts: [
      "電子カルテのバックアップは、保守のベンダーが毎晩自動で取っていると聞いている。作業の報告書が毎月届く",
      "バックアップから実際に戻してみたことは、自分が来てから一度もない。前の担当者からも聞いていない",
      "サーバー室の棚に黒い箱があり、それがバックアップの機器らしい。ふだんつながっているかどうかは分からない",
      "戻す手順を書いた文書は病院にはない。誰が何をするかも決まっていない",
    ],
    style: [
      "答えは短い。「はい」「たぶん」「ベンダーさんに任せています」で済ませがち",
      "分からないことは「わかりません」と言う。推測で答えない",
      "専門用語は使わない。聞き慣れない言葉が出たら、ことばの相談で聞いてみる",
    ],
    expected: { acquire: "confirmed", restore: "denied", isolate: "unknown", procedure: "denied" },
  },
  {
    id: "talkative_mixup",
    name: "話がそれて、言葉を取り違える",
    itemId: "backup",
    facts: [
      "電子カルテのデータは、別の建物にあるサーバーに毎日「同期」していると聞いている。自分ではこれをバックアップだと思っている（実際には、ベンダーが毎日バックアップを取っている）",
      "去年、停電のあとにベンダーがデータを戻してくれて、問題なく診療を再開できた",
      "別の建物のサーバーは、院内のネットワークに常につながっている",
      "戻すときはベンダーに電話する。手順の文書はなく、院内で誰が何をするかも決まっていない",
    ],
    style: [
      "話が長く、質問と関係ない心配（うちは狙われやすいのか、など）を混ぜる",
      "「同期」と「バックアップ」を同じ意味で使う",
      "質問の意味が分からないときは、問い返す",
    ],
    expected: { acquire: "confirmed", restore: "confirmed", isolate: "denied", procedure: "denied" },
  },
];
