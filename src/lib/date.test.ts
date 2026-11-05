import assert from "node:assert/strict";
import { test } from "node:test";
import { tokyoDateOf, tokyoDateStringOf, tokyoDayLabelOf } from "./date.ts";

// 日本時間の深夜 0:50 に保存したものは、UTC では前の日（11/5 15:50）。ファイル名も案内も 11/6 になること
test("日本時間の深夜に保存した日時は、UTC の前の日ではなく日本の日付になる", () => {
  assert.deepEqual(tokyoDateOf("2026-11-05T15:50:00Z"), { year: 2026, month: 11, day: 6 });
  assert.equal(tokyoDateStringOf("2026-11-05T15:50:00Z"), "2026-11-06");
  assert.equal(tokyoDayLabelOf("2026-11-05T15:50:00Z"), "11月6日");
});

// 日本時間の 0:00（UTC 15:00）を境に日付が変わる。その1秒前は前の日
test("日付の境目：日本時間の 0:00 ちょうどで日が変わり、1秒前は前の日", () => {
  assert.equal(tokyoDateStringOf("2026-11-05T14:59:59Z"), "2026-11-05");
  assert.equal(tokyoDayLabelOf("2026-11-05T14:59:59Z"), "11月5日");
  assert.equal(tokyoDateStringOf("2026-11-05T15:00:00Z"), "2026-11-06");
  assert.equal(tokyoDayLabelOf("2026-11-05T15:00:00Z"), "11月6日");
});

// 朝9時（UTC 0:00）より前はいつもずれていた。朝9時以降は UTC と同じ日
test("日本時間の朝9時以降は UTC と同じ日になる", () => {
  assert.equal(tokyoDateStringOf("2026-11-05T00:00:00Z"), "2026-11-05");
  assert.equal(tokyoDateStringOf("2026-11-05T08:30:00Z"), "2026-11-05");
  assert.equal(tokyoDayLabelOf("2026-11-01T09:00:00.000Z"), "11月1日");
});

test("年の境目：大みそかの夜に保存すると、日本では元日になる", () => {
  assert.equal(tokyoDateStringOf("2026-12-31T15:00:00Z"), "2027-01-01");
  assert.equal(tokyoDayLabelOf("2026-12-31T15:00:00Z"), "1月1日");
  assert.equal(tokyoDateStringOf("2026-12-31T14:59:59Z"), "2026-12-31");
});

// ファイル名の月日は2桁にそろえ、案内の月日は0を付けない
test("月日が1桁のとき、ファイル名は2桁にそろえ、案内はそのまま", () => {
  assert.equal(tokyoDateStringOf("2026-01-05T00:00:00Z"), "2026-01-05");
  assert.equal(tokyoDayLabelOf("2026-01-05T00:00:00Z"), "1月5日");
});

// 時差つきの表記（+09:00）で保存されていても、同じ瞬間なら同じ日付
test("時差つきの表記でも同じ瞬間なら同じ日付になる", () => {
  assert.equal(tokyoDateStringOf("2026-11-06T00:50:00+09:00"), "2026-11-06");
  assert.equal(tokyoDateStringOf("2026-11-05T15:50:00Z"), tokyoDateStringOf("2026-11-06T00:50:00+09:00"));
});

test("日時が読めなければ null", () => {
  assert.equal(tokyoDateOf(""), null);
  assert.equal(tokyoDateStringOf("きのう"), null);
  assert.equal(tokyoDayLabelOf("2026-13-45"), null);
  assert.equal(tokyoDateStringOf("2026-11-05T25:00:00Z"), null);
});

// 読み込むファイルの savedAt は信頼できない入力。時差のない日時は端末の時刻として読まれ、日付が端末のタイムゾーンで
// 変わってしまうので受け付けない。日付だけ、ISO 以外の書き方も受け付けない（アプリは toISOString の形でしか書かない）
test("時差のない日時や ISO 以外の書き方は受け付けない", () => {
  assert.equal(tokyoDateStringOf("2026-11-05T23:30"), null);
  assert.equal(tokyoDateStringOf("2026-11-05T23:30:00"), null);
  assert.equal(tokyoDateStringOf("2026-11-05"), null);
  assert.equal(tokyoDateStringOf("Nov 5 2026 23:30"), null);
  assert.equal(tokyoDateStringOf(" 2026-11-05T15:50:00.000Z"), null);
  // toISOString の形（ミリ秒つき）と、秒なし・ミリ秒なし・時差つきは受け付ける
  assert.equal(tokyoDateStringOf("2026-11-05T15:50:00.000Z"), "2026-11-06");
  assert.equal(tokyoDateStringOf("2026-11-05T15:50Z"), "2026-11-06");
  assert.equal(tokyoDateStringOf("2026-11-05T15:50:00Z"), "2026-11-06");
  assert.equal(tokyoDateStringOf("2026-11-06T00:50:00.000+09:00"), "2026-11-06");
  assert.equal(tokyoDateStringOf("2026-11-05T06:50:00-09:00"), "2026-11-06");
});

// 利用者は日本の病院。ブラウザやサーバー（Vercel は UTC）のタイムゾーンがどうであっても、日本時間の日付になること。
// Node は実行中に TZ を変えると Date の計算に反映される
test("実行環境のタイムゾーンに関係なく日本時間の日付になる", () => {
  const original = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      assert.equal(tokyoDateStringOf("2026-11-05T15:50:00Z"), "2026-11-06", zone);
      assert.equal(tokyoDayLabelOf("2026-11-05T15:50:00Z"), "11月6日", zone);
      assert.equal(tokyoDateStringOf("2026-11-05T14:59:59Z"), "2026-11-05", zone);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
