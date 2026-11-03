import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKUP_ITEM } from "../data/backup.ts";
import { DEVICES_ITEM } from "../data/devices.ts";
import { ITEMS } from "../data/items.ts";
import { UPDATE_ITEM } from "../data/update.ts";
import { checkImage, imageGate, MAX_IMAGE_DATA_LENGTH, MAX_IMAGES_PER_INTERVIEW, parseReading } from "./read-image.ts";
import { createSession } from "./session.ts";

function base64(bytes: number[]): string {
  return Buffer.from([...bytes, ...new Array(16).fill(0)]).toString("base64");
}

const JPEG = base64([0xff, 0xd8, 0xff, 0xe0]);
const PNG = base64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = base64([..."RIFF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [..."WEBP"].map((c) => c.charCodeAt(0))));
const GIF = base64([..."GIF89a"].map((c) => c.charCodeAt(0)));

test("写真の読み取り：種類が合う画像だけ通す", () => {
  assert.equal(checkImage({ media_type: "image/jpeg", data: JPEG }), null);
  assert.equal(checkImage({ media_type: "image/png", data: PNG }), null);
  assert.equal(checkImage({ media_type: "image/webp", data: WEBP }), null);
  // 申告と中身が違うものは拒む
  assert.match(checkImage({ media_type: "image/jpeg", data: PNG }) ?? "", /形式/);
  assert.match(checkImage({ media_type: "image/jpeg", data: GIF }) ?? "", /形式/);
});

test("写真の読み取り：大きさと文字の決まりを守らない画像を拒む", () => {
  assert.match(checkImage({ media_type: "image/jpeg", data: "" }) ?? "", /大きすぎ/);
  assert.match(checkImage({ media_type: "image/jpeg", data: "A".repeat(MAX_IMAGE_DATA_LENGTH + 1) }) ?? "", /大きすぎ/);
  assert.match(checkImage({ media_type: "image/jpeg", data: "data:image/jpeg;base64,/9j/" }) ?? "", /送れません/);
  assert.match(checkImage({ media_type: "image/jpeg", data: "/9j/" }) ?? "", /形式/);
});

test("写真の読み取り：回答を待っているときだけ、5枚まで使える", () => {
  const session = createSession(BACKUP_ITEM, "yes", "no_item");
  assert.equal(imageGate(session)?.status, 400);

  session.pendingQuestionId = "q1";
  session.questionCount = 1;
  assert.equal(imageGate(session), null);

  session.imageCount = MAX_IMAGES_PER_INTERVIEW;
  assert.equal(imageGate(session)?.status, 429);

  session.imageCount = 0;
  session.finished = true;
  assert.equal(imageGate(session)?.status, 400);
});

test("写真の読み取り：写真の例がない対策では使えない", () => {
  const session = createSession(DEVICES_ITEM, "yes", "unknown");
  session.pendingQuestionId = "q1";
  session.questionCount = 1;
  assert.match(imageGate(session)?.error ?? "", /使えません/);
});

test("写真の読み取り：決まった形だけ受け付け、長さを画面に収める", () => {
  assert.equal(parseReading({ subject: "画面" }), null);
  assert.equal(parseReading({ subject: "画面", readings: "文字", unknowns: [], cautions: [], draft: "" }), null);

  const reading = parseReading({
    subject: "  バックアップのソフトの履歴の画面  ",
    readings: Array.from({ length: 12 }, (_, index) => `${index}`).concat([" ", ""]),
    unknowns: ["x".repeat(400)],
    cautions: [],
    draft: "y".repeat(800),
  });
  assert.ok(reading);
  assert.equal(reading.subject, "バックアップのソフトの履歴の画面");
  assert.equal(reading.readings.length, 8);
  assert.equal(reading.unknowns[0].length, 200);
  assert.deepEqual(reading.cautions, []);
  assert.equal(reading.draft.length, 500);
});

test("写真の例：バックアップと更新プログラムだけに、短い例が2〜4件ある", () => {
  for (const item of ITEMS) {
    if (item.id === BACKUP_ITEM.id || item.id === UPDATE_ITEM.id) {
      assert.ok(item.photoHints && item.photoHints.length >= 2 && item.photoHints.length <= 4, item.id);
      for (const hint of item.photoHints) assert.ok(hint.length > 0 && hint.length <= 60, hint);
    } else {
      assert.equal(item.photoHints, undefined, item.id);
    }
  }
});
