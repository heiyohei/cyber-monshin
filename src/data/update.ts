import { MANUAL, OPERATION, PLANNING } from "./sources.ts";
import type { FocusItem } from "./types.ts";

// 更新プログラム（2-⑥）。観点と判定の基準は heiyo の承認を得てから公開する
export const UPDATE_ITEM = {
  id: "update",
  name: "更新プログラム",
  stage: "入られる",
  checkItems: [
    {
      no: "2-⑥",
      text: "セキュリティパッチ（最新ファームウェアや更新プログラム）を適用している。",
      keywords: ["セキュリティパッチ"],
    },
  ],
  vendorCheckItem: {
    no: "2-⑥",
    text: "セキュリティパッチ（最新ファームウェアや更新プログラム）を適用している。",
    keywords: ["セキュリティパッチ"],
  },
  firstQuestion: {
    id: "update_q1",
    text: "パソコンやサーバー、ネットワーク機器のセキュリティの更新は、誰が、どのくらいの頻度で行っていますか？",
    why: "攻撃の多くは、更新されていない機器の弱いところから入ってきます。まず、更新が行われているかを確かめます。",
    options: ["ベンダーが定期的に行っている", "院内の担当者が行っている", "行っていない", "わからない"],
  },
  defaultEvidence: {
    id: "ev_update",
    text: "システム運用担当者は、医療情報システムが利用する情報機器等の脆弱性に関する情報を常に収集し、脆弱性への対応を速やかに行う必要がある。",
    source: `${OPERATION} 8.2 18ページ`,
  },
  primaryViewpoints: ["apply"],
  viewpoints: [
    {
      id: "apply",
      name: "適用",
      goal: "セキュリティの更新を、定期的に当てている",
      evidence: {
        id: "ev_update_apply",
        text: "セキュリティ・ホール（脆弱性）が報告されているソフトウェアへのセキュリティパッチを適用することが挙げられます。",
        source: `${MANUAL} 2-⑥ 9ページ`,
      },
      impactRank: 1,
      hole: "セキュリティの更新が当てられておらず、攻撃の入口になるおそれがある",
      nextSteps: {
        free: "更新を当てた記録が、作業報告などで届いているかを確かめる",
        vendor: "どの機器に、どのくらいの頻度で更新を当てているかを聞く",
        budget: "更新を定期的に当てる作業を、保守契約に入れることを検討する",
      },
    },
    {
      id: "responsibility",
      name: "担当の取り決め",
      goal: "誰が更新を当てるかが、ベンダーの保守の対象外の機器も含めて決まっている",
      evidence: {
        id: "ev_update_responsibility",
        text: "特に、アップデートについては可能な限り、事業者の保守範囲に含めることが望ましい。保守範囲とならない場合は、医療機関等の責任でアップデートが必要となる。",
        source: `${PLANNING} 15.1 51ページ`,
      },
      impactRank: 2,
      hole: "ベンダーの保守の対象外の機器があり、誰も更新していないおそれがある",
      nextSteps: {
        free: "保守契約書で、更新が保守の範囲に入っているかを確かめる",
        vendor: "保守の対象外になっている機器と、その更新を誰が行うかを聞く",
        budget: "対象外の機器の更新を、保守契約に加えることを検討する",
      },
    },
    {
      id: "inventory",
      name: "機器の把握",
      goal: "更新が必要な機器とソフトを把握し、サポートが終わったものがないかを確かめている",
      evidence: {
        id: "ev_update_inventory",
        text: "情報機器やソフトウェアのアップデートの履行状況や、EOS の対象となった情報機器やソフトウェアの状況、委託契約の範囲（アップデート等に関する責任分界含む）を含めること。",
        source: `${PLANNING} 9.4 35ページ`,
      },
      impactRank: 3,
      hole: "サポートが終わり、更新が出なくなった機器が残っているおそれがある",
      nextSteps: {
        free: "院内の機器の一覧があるか、古い機器が残っていないかを確かめる",
        vendor: "サポートが終わった機器やソフトがないかを聞く",
        budget: "サポートが終わった機器の入れ替えを、次のシステム更改で検討する",
      },
    },
    {
      id: "verify",
      name: "当てたあとの確認",
      goal: "更新を当てたあと、システムが正しく動くかを確かめている",
      evidence: {
        id: "ev_update_verify",
        text: "（非常時に備えた対策として）OS のセキュリティ・パッチ適用後やマルウェア対策ソフトのパターンファイル最新化後の稼働確認…などを実施することが求められる。",
        source: `${OPERATION} 11.1 25ページ`,
      },
      impactRank: 4,
      hole: "更新のあとに動作を確かめず、不具合で診療が止まるおそれがある",
      nextSteps: {
        free: "更新のあとに不具合がなかったかを、作業報告で確かめる",
        vendor: "更新のあとに動作を確かめているかを聞く",
        budget: "影響の少ない機器から順に当てる手順や、試験用の環境を検討する",
      },
    },
  ],
  // サンプルでは、事業者が「対象外」と答えている（対象外のすき間を見せるため）
  sample: { lastYearAnswer: "yes", vendorAnswer: "not_applicable" },
} as const satisfies FocusItem;
