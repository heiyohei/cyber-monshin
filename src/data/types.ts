export type Evidence = { id: string; text: string; source: string };
// 次の一手。id は保存ファイルの「やった」印に使うので、項目を足したり並べ替えたりしても変えない
// （「項目.観点.分類」の形。文を直しても id は変えない）
export type NextStep = { id: string; text: string };
export type NextSteps = { free: NextStep; vendor: NextStep; budget: NextStep };

export type ViewpointDef = {
  id: string;
  // Claude に渡す観点名（get_focus_item）。変えると問診の読み取りが変わりうるので、評価なしに変えない
  name: string;
  // 画面に出す表示名。何をすることかが読める短い言葉（「バックアップを取る」など）。Claude には渡さない。
  // 判定カード、まとめの表、これまでの質問と回答、止まるおそれ、説明用の1枚など、画面ではすべてこちらを使う
  label: string;
  goal: string;
  evidence: Evidence;
  // 止まる穴の順位。1が最も影響が大きい。Claude には渡さず、コードが使う
  impactRank: number;
  hole: string;
  nextSteps: NextSteps;
};

// Excel から読むときは、文面が版で少し変わるので、言葉で行を探す
export type CheckItem = { no: string; text: string; keywords: readonly string[] };

export type FocusItem = {
  id: string;
  name: string;
  stage: string;
  checkItems: readonly CheckItem[];
  // 事業者用チェックリストの対応する項目。なければ null
  vendorCheckItem: CheckItem | null;
  firstQuestion: { id: string; text: string; why: string; options: readonly string[] };
  defaultEvidence: Evidence;
  // この観点が否定なら「いいえ」、不明なら「要確認」になる、最も重い観点
  primaryViewpoints: readonly string[];
  viewpoints: readonly ViewpointDef[];
  sample: { lastYearAnswer: "yes" | "no" | "unknown"; vendorAnswer: "yes" | "no" | "not_applicable" | "no_item" | "unknown" };
  // 写真や画面で答えるときの例。この項目がある重点項目だけ、画面に「写真や画面で答える」を出す
  photoHints?: readonly string[];
};

// まだ作っていない重点項目。画面では「今後の拡張」と示す
export type PlannedItem = { id: string; name: string; stage: string; checkItems: readonly string[] };
