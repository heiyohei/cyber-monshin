import { MANUAL, PLANNING } from "./sources.ts";
import type { FocusItem } from "./types.ts";

// 診療を止めない備え（3-①、3-③）。観点と判定の基準は heiyo の承認を得た（2026-11-03）
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
      label: "止まったときの計画を作る",
      goal: "攻撃でシステムが止まったときに、どの診療をどう続けるかが計画として決まっている",
      evidence: {
        id: "ev_continuity_plan",
        text: "医療機関等の経営層等は企画管理者等と連携して非常時における業務継続の可否の判断基準や継続する業務選定等の意思決定プロセスを検討し、サイバー攻撃の想定を含む BCP 等を整備することとしています。",
        source: `${MANUAL} 3-③ 17ページ`,
      },
      impactRank: 1,
      hole: "攻撃でシステムが止まったときに、どう診療を続けるかが決まっていません。診療が長く止まるおそれがあります。",
      nextSteps: {
        free: { id: "continuity.plan.free", text: "地震や停電のときの計画があれば、攻撃でシステムが止まったときにも使えるかを読み直します。" },
        vendor: { id: "continuity.plan.vendor", text: "システムが止まったときに、紙で診療を続けるために必要な情報は何かを聞きます。" },
        budget: { id: "continuity.plan.budget", text: "攻撃に備えた計画づくりを、外部の専門家に手伝ってもらうことを考えます。" },
      },
    },
    {
      id: "contacts",
      name: "連絡の流れ",
      label: "連絡の順番を図にする",
      goal: "攻撃に気づいたとき、院内と外部（ベンダー、厚生労働省、警察など）への連絡先と順番が図になっている",
      evidence: {
        id: "ev_continuity_contacts",
        text: "企画管理者等は情報セキュリティインシデント発生時、速やかに情報共有等が行えるよう、緊急連絡網を明示した連絡体制図を作成して下さい。",
        source: `${MANUAL} 3-① 16ページ`,
      },
      impactRank: 2,
      hole: "攻撃に気づいたとき、誰にどの順番で知らせるかが決まっていません。対応が遅れて、被害が広がるおそれがあります。",
      nextSteps: {
        free: { id: "continuity.contacts.free", text: "院内の担当者、ベンダー、厚生労働省、警察の連絡先を、1枚の図にまとめます。" },
        vendor: { id: "continuity.contacts.vendor", text: "攻撃が疑われるときに、夜間や休日でもつながるベンダーの連絡先を聞きます。" },
        budget: { id: "continuity.contacts.budget", text: "相談できる外部の専門家と、前もって契約しておくことを考えます。" },
      },
    },
    {
      id: "drill",
      name: "訓練",
      label: "訓練で試す",
      goal: "計画どおりに動けるかを、訓練で確かめている",
      evidence: {
        id: "ev_continuity_drill",
        text: "非常時における対応に関して、医療機関等の職員、外部の関係者等に対する教育を行うほか、定期的に訓練を実施すること。",
        source: `${PLANNING} 11 37ページ`,
      },
      impactRank: 3,
      hole: "計画はあっても、その通りに動けるかを試していません。いざというときに動けないおそれがあります。",
      nextSteps: {
        free: { id: "continuity.drill.free", text: "連絡の図を使って、関係者に順番に連絡してみる短い練習をします。" },
        vendor: { id: "continuity.drill.vendor", text: "システムが止まったときの練習に、ベンダーも参加してもらえるかを聞きます。" },
        budget: { id: "continuity.drill.budget", text: "紙での診療に切り替える練習を、外部の手伝いを受けて行うことを考えます。" },
      },
    },
    {
      id: "vendor_bcp",
      name: "ベンダー側の備え",
      label: "ベンダーの備えを確かめる",
      goal: "ベンダーも、攻撃を受けたときの計画を作っていることを確かめている",
      evidence: {
        id: "ev_continuity_vendor_bcp",
        text: "事業者確認用チェックリストを通して、事業者が BCP を策定して、非常時の対応に備えていることを確認して下さい。",
        source: `${MANUAL} 3-③ 17ページ`,
      },
      impactRank: 4,
      hole: "ベンダー自身が攻撃を受けたときの備えを確かめていません。ベンダーが止まると、病院の点検や修理も止まるおそれがあります。",
      nextSteps: {
        free: { id: "continuity.vendor_bcp.free", text: "ベンダーから届いた事業者用のチェックリストで、チェック項目 3-③（攻撃に備えた計画）の答えを確かめます。" },
        vendor: { id: "continuity.vendor_bcp.vendor", text: "ベンダーが攻撃を受けたときに、病院への点検や修理をどう続けるかを聞きます。" },
        budget: { id: "continuity.vendor_bcp.budget", text: "ベンダーが止まったときの代わりの手段を、保守の契約に入れることを考えます。" },
      },
    },
  ],
  // サンプルでは、事業者が BCP を「策定している」と答えている
  sample: { lastYearAnswer: "yes", vendorAnswer: "yes" },
} as const satisfies FocusItem;
