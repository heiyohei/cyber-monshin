// 根拠は厚生労働省の公開資料の原文の引用。ページは資料に印刷された番号。
// 引用は PDF から取り出した原文と照合した（2026-11-03）
export const SOURCES = [
  {
    title: "医療機関・薬局におけるサイバーセキュリティ対策チェックリスト（令和8年度版）",
    url: "https://www.mhlw.go.jp/content/10808000/001716185.pdf",
  },
  {
    title: "医療機関・薬局におけるサイバーセキュリティ対策チェックリストマニュアル～医療機関・薬局・事業者向け～（令和8年度版）",
    url: "https://www.mhlw.go.jp/content/10808000/001716186.pdf",
  },
  {
    title: "医療情報システムの安全管理に関するガイドライン 第7.0版 企画管理編",
    url: "https://www.mhlw.go.jp/content/10808000/001716292.pdf",
  },
  {
    title: "医療情報システムの安全管理に関するガイドライン 第7.0版 システム運用編",
    url: "https://www.mhlw.go.jp/content/10808000/001716295.pdf",
  },
] as const;

export const MANUAL = "チェックリストマニュアル（令和8年度版）";
export const PLANNING = "安全管理ガイドライン 第7.0版 企画管理編";
export const OPERATION = "安全管理ガイドライン 第7.0版 システム運用編";
