import { MANUAL, OPERATION, PLANNING } from "./sources.ts";
import type { FocusItem } from "./types.ts";

// 更新プログラム（2-⑥）。観点と判定の基準は heiyo の承認を得た（2026-11-03）
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
      label: "更新を入れる",
      goal: "セキュリティの更新を、定期的に当てている",
      evidence: {
        id: "ev_update_apply",
        text: "セキュリティ・ホール（脆弱性）が報告されているソフトウェアへのセキュリティパッチを適用することが挙げられます。",
        source: `${MANUAL} 2-⑥ 9ページ`,
      },
      impactRank: 1,
      hole: "パソコンやサーバーに、セキュリティの更新が入っていません。古いままの弱いところから攻撃されるおそれがあります。",
      nextSteps: {
        free: { id: "update.apply.free", text: "更新を入れた記録が、ベンダーの作業報告などで届いているかを確かめます。" },
        vendor: { id: "update.apply.vendor", text: "どの機器に、どのくらいの間隔で更新を入れているかを聞きます。" },
        budget: { id: "update.apply.budget", text: "更新を決まった間隔で入れる作業を、保守の契約に入れることを考えます。" },
      },
    },
    {
      id: "responsibility",
      name: "担当の取り決め",
      label: "更新の担当を決める",
      goal: "誰が更新を当てるかが、ベンダーの保守の対象外の機器も含めて決まっている",
      evidence: {
        id: "ev_update_responsibility",
        text: "特に、アップデートについては可能な限り、事業者の保守範囲に含めることが望ましい。保守範囲とならない場合は、医療機関等の責任でアップデートが必要となる。",
        source: `${PLANNING} 15.1 51ページ`,
      },
      impactRank: 2,
      hole: "ベンダーの契約に入っていない機器があり、その更新を誰も行っていないおそれがあります。",
      nextSteps: {
        free: { id: "update.responsibility.free", text: "保守の契約書で、更新の作業が契約に入っているかを確かめます。" },
        vendor: { id: "update.responsibility.vendor", text: "契約に入っていない機器はどれか、その更新は誰が行うかを聞きます。" },
        budget: { id: "update.responsibility.budget", text: "契約に入っていない機器の更新を、保守の契約に加えることを考えます。" },
      },
    },
    {
      id: "inventory",
      name: "機器の把握",
      label: "更新が要る機器を把握する",
      goal: "更新が必要な機器とソフトを把握し、サポートが終わったものがないかを確かめている",
      evidence: {
        id: "ev_update_inventory",
        text: "情報機器やソフトウェアのアップデートの履行状況や、EOS の対象となった情報機器やソフトウェアの状況、委託契約の範囲（アップデート等に関する責任分界含む）を含めること。",
        source: `${PLANNING} 9.4 35ページ`,
      },
      impactRank: 3,
      hole: "メーカーのサポートが終わり、もう更新が出ない古い機器が残っているおそれがあります。",
      nextSteps: {
        free: { id: "update.inventory.free", text: "院内の機器の一覧があるか、古い機器が残っていないかを確かめます。" },
        vendor: { id: "update.inventory.vendor", text: "サポートが終わった機器やソフトがないかを聞きます。" },
        budget: { id: "update.inventory.budget", text: "サポートが終わった機器の入れ替えを、次にシステムを入れ替えるときに考えます。" },
      },
    },
    {
      id: "verify",
      name: "当てたあとの確認",
      label: "更新のあと動作を確かめる",
      goal: "更新を当てたあと、システムが正しく動くかを確かめている",
      evidence: {
        id: "ev_update_verify",
        text: "（非常時に備えた対策として）OS のセキュリティ・パッチ適用後やマルウェア対策ソフトのパターンファイル最新化後の稼働確認…などを実施することが求められる。",
        source: `${OPERATION} 11.1 25ページ`,
      },
      impactRank: 4,
      hole: "更新のあとに動作を確かめていません。更新が原因の不具合で、診療が止まるおそれがあります。",
      nextSteps: {
        free: { id: "update.verify.free", text: "更新のあとに不具合がなかったかを、作業報告で確かめます。" },
        vendor: { id: "update.verify.vendor", text: "更新のあとに、システムが正しく動くかを確かめているかを聞きます。" },
        budget: { id: "update.verify.budget", text: "影響の小さい機器から順に更新する手順や、試しに更新してみる環境を考えます。" },
      },
    },
  ],
  // サンプルでは、事業者が「対象外」と答えている（対象外のすき間を見せるため）
  sample: { lastYearAnswer: "yes", vendorAnswer: "not_applicable" },
  photoHints: [
    "Windows の更新の画面（最後に更新した日が分かるもの）",
    "パソコンやサーバーの、Windows などの種類と版（バージョン）が分かる画面",
    "ベンダーの作業報告書のうち、更新について書かれた欄",
  ],
} as const satisfies FocusItem;
