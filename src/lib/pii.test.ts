import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPersonalInfo } from "./pii.ts";

test("個人情報：よくある形式を見つける", () => {
  assert.deepEqual(detectPersonalInfo("担当は taro.yamada@example.com です"), ["メールアドレス"]);
  assert.deepEqual(detectPersonalInfo("サーバーは 192.168.10.5 です"), ["IP アドレス"]);
  assert.deepEqual(detectPersonalInfo("fe80::1:2:3:4 につないでいます"), ["IP アドレス"]);
  assert.deepEqual(detectPersonalInfo("連絡先 03-1234-5678"), ["電話番号"]);
  assert.deepEqual(detectPersonalInfo("携帯は09012345678"), ["電話番号"]);
  assert.deepEqual(detectPersonalInfo("資料は https://example.com/a にあります"), ["URL"]);
  assert.deepEqual(detectPersonalInfo("〒123-4567"), ["郵便番号"]);
});

test("個人情報：全角で書かれていても見つける", () => {
  assert.deepEqual(detectPersonalInfo("１９２．１６８．１．１"), ["IP アドレス"]);
});

test("個人情報：ふつうの回答では警告しない", () => {
  for (const text of [
    "ベンダーさんが毎日、夜に取っています",
    "2025年10月に戻す試験をしました",
    "3-② の項目は「はい」です",
    "1日1回、週に7回",
  ]) {
    assert.deepEqual(detectPersonalInfo(text), [], text);
  }
});
