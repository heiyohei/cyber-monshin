import { MANUAL, PLANNING } from "./sources.ts";
import type { FocusItem } from "./types.ts";

// 診療を止めない備え（3-①、3-③）。観点と判定の基準は heiyo の承認を得てから公開する
export const CONTINUITY_ITEM = {
  id: "continuity",
  name: "診療を止めない備え",
  stage: "止まる",
  checkItems: [
    {
      no: "3-①",
      text: "インシデント発生時における組織内と外部関係機関（事業者、厚生労働省、警察等）への連絡体制図がある。",
      keywords: ["連絡体制図"],
    },
    {
      no: "3-③",
      text: "サイバー攻撃の想定を含む事業継続計画（BCP）を策定している。",
      keywords: ["事業継続計画"],
    },
  ],
  vendorCheckItem: {
    no: "3-③",
    text: "サイバー攻撃の想定を含む事業継続計画（BCP）を策定している。",
    keywords: ["事業継続計画"],
  },
  firstQuestion: {
    id: "continuity_q1",
    text: "電子カルテなどが攻撃で使えなくなったとき、どうやって診療を続けるかを決めた文書はありますか？",
    why: "攻撃でシステムが止まると、その場で考えていては診療が止まってしまいます。まず、止まったときの動き方が決まっているかを確かめます。",
    options: ["攻撃の場合も含めて決めてある", "地震や停電の場合だけ決めてある", "決めていない", "わからない"],
  },
  defaultEvidence: {
    id: "ev_continuity",
    text: "医療情報システムの安全管理に関して、非常時における対応方針と対応手順・内容の整理を行い、BCP（Business Continuity Plan:事業継続計画）を策定すること。",
    source: `${PLANNING} 11 37ページ`,
  },
  primaryViewpoints: ["plan"],
  viewpoints: [
    {
      id: "plan",
      name: "攻撃を想定した計画",
      goal: "攻撃でシステムが止まったときに、どの診療をどう続けるかが計画として決まっている",
      evidence: {
        id: "ev_continuity_plan",
        text: "医療機関等の経営層等は企画管理者等と連携して非常時における業務継続の可否の判断基準や継続する業務選定等の意思決定プロセスを検討し、サイバー攻撃の想定を含む BCP 等を整備することとしています。",
        source: `${MANUAL} 3-③ 17ページ`,
      },
      impactRank: 1,
      hole: "攻撃でシステムが止まったときの動き方が決まっておらず、診療が長く止まるおそれがある",
      nextSteps: {
        free: "地震や停電の計画があれば、攻撃でシステムが止まった場合にも使えるかを読み直す",
        vendor: "システムが止まったときに、紙で診療を続けるために必要な情報を聞く",
        budget: "攻撃を想定した計画づくりを、外部の専門家に手伝ってもらうことを検討する",
      },
    },
    {
      id: "contacts",
      name: "連絡の流れ",
      goal: "攻撃に気づいたとき、院内と外部（ベンダー、厚生労働省、警察など）への連絡先と順番が図になっている",
      evidence: {
        id: "ev_continuity_contacts",
        text: "企画管理者等は情報セキュリティインシデント発生時、速やかに情報共有等が行えるよう、緊急連絡網を明示した連絡体制図を作成して下さい。",
        source: `${MANUAL} 3-① 16ページ`,
      },
      impactRank: 2,
      hole: "誰に、どの順で知らせるかが決まっておらず、初動が遅れて被害が広がるおそれがある",
      nextSteps: {
        free: "院内の担当者、ベンダー、厚生労働省、警察の連絡先を一枚の図にまとめる",
        vendor: "攻撃が疑われるときの、ベンダーの夜間や休日の連絡先を聞く",
        budget: "相談できる外部の専門家と、あらかじめ契約しておくことを検討する",
      },
    },
    {
      id: "drill",
      name: "訓練",
      goal: "計画どおりに動けるかを、訓練で確かめている",
      evidence: {
        id: "ev_continuity_drill",
        text: "非常時における対応に関して、医療機関等の職員、外部の関係者等に対する教育を行うほか、定期的に訓練を実施すること。",
        source: `${PLANNING} 11 37ページ`,
      },
      impactRank: 3,
      hole: "計画があっても、実際にその通りに動けるかを確かめていない",
      nextSteps: {
        free: "連絡の図を使って、関係者に順に連絡してみる短い訓練をする",
        vendor: "システムが止まった想定の訓練に、参加してもらえるかを聞く",
        budget: "紙での診療に切り替える訓練を、外部の支援を受けて行うことを検討する",
      },
    },
    {
      id: "vendor_bcp",
      name: "ベンダー側の備え",
      goal: "ベンダーも、攻撃を受けたときの計画を作っていることを確かめている",
      evidence: {
        id: "ev_continuity_vendor_bcp",
        text: "事業者確認用チェックリストを通して、事業者が BCP を策定して、非常時の対応に備えていることを確認して下さい。",
        source: `${MANUAL} 3-③ 17ページ`,
      },
      impactRank: 4,
      hole: "ベンダーが攻撃を受けたときに、保守やサービスが止まるおそれがある",
      nextSteps: {
        free: "ベンダーから届いたチェックリストで、3-③ の答えを確かめる",
        vendor: "ベンダーが攻撃を受けたときに、病院への保守をどう続けるかを聞く",
        budget: "ベンダーが止まったときの代わりの手段を、保守契約に入れることを検討する",
      },
    },
  ],
  // サンプルでは、事業者が BCP を「策定している」と答えている
  sample: { lastYearAnswer: "yes", vendorAnswer: "yes" },
} as const satisfies FocusItem;
