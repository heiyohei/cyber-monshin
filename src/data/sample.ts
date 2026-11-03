import type { LastYearAnswer, VendorAnswer } from "../lib/session.ts";

// 黒戸記念病院と黒戸町は架空。病院名は画面の説明だけに使い、サーバーへは送らない。
export const SAMPLE_HOSPITAL = {
  name: "黒戸（くろうど）記念病院",
  description: "黒戸町にある、100床ほどの架空の病院です。去年のチェックリストでは、バックアップに「はい」と答えています。",
  lastYearAnswer: "yes" as LastYearAnswer,
  vendorAnswer: "no_item" as VendorAnswer,
};
