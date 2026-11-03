import type { FocusItem } from "./types.ts";

// 黒戸記念病院と黒戸町は架空。病院名は画面の説明だけに使い、サーバーへは送らない。
export const SAMPLE_HOSPITAL = { name: "黒戸（くろうど）記念病院" };

const ANSWER_LABELS = { yes: "はい", no: "いいえ", unknown: "わからない" } as const;

// 重点項目ごとのサンプルの説明。回答は項目の固定データ（sample）から作る
export function sampleDescription(item: FocusItem): string {
  const numbers = item.checkItems.map((checkItem) => checkItem.no).join("、");
  const vendor =
    item.sample.vendorAnswer === "not_applicable"
      ? "保守のベンダーは、事業者用のチェックリストでこの項目を「対象外」と答えています。"
      : "";
  return `黒戸町にある、100床ほどの架空の病院です。去年のチェックリストでは、${numbers} に「${ANSWER_LABELS[item.sample.lastYearAnswer]}」と答えています。${vendor}`;
}
