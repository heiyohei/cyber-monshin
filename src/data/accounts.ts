import { MANUAL, OPERATION } from "./sources.ts";
import type { FocusItem } from "./types.ts";

// アカウントと権限（2-④、2-⑤、2-⑧、2-⑪、2-⑫）。観点と判定の基準は heiyo の承認を得た（2026-11-03）
export const ACCOUNTS_ITEM = {
  id: "accounts",
  name: "アカウントと権限",
  stage: "広がる",
  checkItems: [
    {
      no: "2-④",
      text: "利用者の職種・担当業務別の情報区分毎のアクセス利用権限を設定している。※管理者権限対象者の明確化を行っている",
      keywords: ["アクセス利用権限"],
    },
    {
      no: "2-⑤",
      text: "退職者や使用していないアカウント等、不要なアカウントを削除または無効化している。",
      keywords: ["不要なアカウント"],
    },
    {
      no: "2-⑧",
      text: "パスワードの使い回しを禁止している。",
      keywords: ["使い回し"],
    },
    {
      no: "2-⑪",
      text: "アプリケーションログイン時の二要素認証を実装している。または令和９年度以降初回のシステム更改時に実装予定である。",
      keywords: ["アプリケーションログイン"],
    },
    {
      no: "2-⑫",
      text: "OSログイン時の二要素認証を実装している。または令和９年度以降初回のシステム更改時に実装予定である。",
      keywords: ["OSログイン"],
    },
  ],
  // 事業者用には 2-④、2-⑤、2-⑧、2-⑪、2-⑫ がある。最も重い観点（管理者の権限）に対応する 2-④ を選んだ
  vendorCheckItem: {
    no: "2-④",
    text: "利用者の職種・担当業務別の情報区分毎のアクセス利用権限を設定している。※管理者権限対象者の明確化を行っている。",
    keywords: ["アクセス利用権限"],
  },
  firstQuestion: {
    id: "accounts_q1",
    text: "電子カルテなどで、設定を変えたりソフトを入れたりできる強い権限（管理者の権限）を持っているのは誰ですか？",
    why: "強い権限を持つアカウントが乗っ取られると、被害が院内全体に広がります。まず、その権限が必要な人だけに絞られているかを確かめます。",
    options: ["決まった数人だけ", "多くの職員が持っている", "ベンダーだけが持っている", "わからない"],
  },
  defaultEvidence: {
    id: "ev_accounts",
    text: "医療情報システムの利用に際しては、情報の種別、重要性と利用形態に応じて情報の区分管理を行い、その情報区分ごと、組織における利用者や利用者グループ（業務単位等）ごとに利用権限を規定する必要がある。",
    source: `${OPERATION} 14.2 38ページ`,
  },
  primaryViewpoints: ["admin"],
  viewpoints: [
    {
      id: "admin",
      name: "管理者の権限",
      label: "強い権限を絞る",
      goal: "設定を変えられる強い権限が、必要な人だけに絞られている",
      evidence: {
        id: "ev_accounts_admin",
        text: "特に管理者権限を与えるアカウントは最低限のユーザに付与することを徹底してください。これはサイバー攻撃を受けた際の水平展開を防ぐためです。",
        source: `${MANUAL} 2-④ 8ページ`,
      },
      impactRank: 1,
      hole: "設定を変えられる強い権限を持つ人が多くいます。1人のIDが乗っ取られると、被害が院内全体に広がるおそれがあります。",
      nextSteps: {
        free: { id: "accounts.admin.free", text: "強い権限を持っている人の名前を、一覧に書き出します。" },
        vendor: { id: "accounts.admin.vendor", text: "強い権限を持つIDの一覧をもらい、減らせるかどうかを聞きます。" },
        budget: { id: "accounts.admin.budget", text: "強い権限がなくても使えるシステムへの切り替えを、次にシステムを入れ替えるときに考えます。" },
      },
    },
    {
      id: "reuse",
      name: "パスワードの使い回し",
      label: "パスワードを使い回さない",
      goal: "同じパスワードを、複数の機器やシステムで使い回していない（ベンダーが管理する機器も含む）",
      evidence: {
        id: "ev_accounts_reuse",
        text: "パスワードの使い回しは漏えいリスクを高め、一度の漏えいにより被害範囲が拡大するため、複数の機器や外部サービス等で、同一のパスワードを設定しないことが必要です。",
        source: `${MANUAL} 2-⑧ 11ページ`,
      },
      impactRank: 2,
      hole: "同じパスワードを、いくつものシステムで使っています。1つ漏れると、多くの機器に入られるおそれがあります。",
      nextSteps: {
        free: { id: "accounts.reuse.free", text: "システムごとに違うパスワードを使うよう、職員に呼びかけます。" },
        vendor: { id: "accounts.reuse.vendor", text: "院内のサーバーや機器、ほかの病院と同じパスワードを使っていないかを聞きます。" },
        budget: { id: "accounts.reuse.budget", text: "パスワードを安全に管理する仕組みや、使い回しを防ぐ設定を考えます。" },
      },
    },
    {
      id: "cleanup",
      name: "不要なアカウント",
      label: "使わないアカウントを止める",
      goal: "退職した人や、使っていないアカウントが残っていない",
      evidence: {
        id: "ev_accounts_cleanup",
        text: "長期間使用されていない等の不要な ID は不正アクセスに利用されるリスクがありますので、適宜削除や無効化をする等の対応をしてください。",
        source: `${MANUAL} 2-⑤ 8ページ`,
      },
      impactRank: 3,
      hole: "辞めた人や使っていない人のログイン用のIDが残っています。ログイン用のIDが残っていると、悪用されるおそれがあります。",
      nextSteps: {
        free: { id: "accounts.cleanup.free", text: "退職者の名簿とログイン用のIDの一覧を見比べ、残っているものを探します。" },
        vendor: { id: "accounts.cleanup.vendor", text: "使っていないIDの止め方と、その作業を頼めるかを聞きます。" },
        budget: { id: "accounts.cleanup.budget", text: "人の出入りに合わせてIDを自動で止める仕組みを、次にシステムを入れ替えるときに考えます。" },
      },
    },
    {
      id: "two_factor",
      name: "ログインの本人確認",
      label: "ログインの確認を二重にする",
      goal: "ログインのときに、パスワードに加えてICカードや指紋などでも本人を確かめている、または次のシステム更改で入れる予定がある",
      evidence: {
        id: "ev_accounts_two_factor",
        text: "令和９年度（令和 9 年 4 月 1 日時点）時点で稼働していることが想定される医療情報システムを、今後、新規導入又は機器の入替等を伴うシステム更改をするに際しては、二要素認証を採用、又はこれに相当する対応を行うこと。",
        source: `${OPERATION} 14 35ページ`,
      },
      impactRank: 4,
      hole: "パスワードだけでログインできます。パスワードが漏れると、すぐに入られるおそれがあります。",
      nextSteps: {
        free: { id: "accounts.two_factor.free", text: "次にシステムを入れ替える時期と、そのときICカードなどでの本人確認を入れる予定があるかを、院内で確かめます。" },
        vendor: { id: "accounts.two_factor.vendor", text: "パソコンとサーバーで、ICカードなどでの本人確認を使えるかを聞きます。" },
        budget: { id: "accounts.two_factor.budget", text: "ICカードや指紋での本人確認を、次にシステムを入れ替えるときに入れることを考えます。" },
      },
    },
  ],
  // サンプルでは、事業者が 2-④ を「対象外」と答えている（権限の設定は病院の責任になるすき間を見せるため）
  sample: { lastYearAnswer: "yes", vendorAnswer: "not_applicable" },
} as const satisfies FocusItem;
