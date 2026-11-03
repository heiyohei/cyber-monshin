import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { giveUp, processToolUses, type InterviewEvent } from "./interview.ts";
import { createSession, vendorRequestFor } from "./session.ts";

function tool(name: string, input: unknown, id = name): Anthropic.Beta.BetaToolUseBlock {
  return { type: "tool_use", id, name, input } as Anthropic.Beta.BetaToolUseBlock;
}

function report(viewpoint_id: string, status: string, answer_ids: string[], item_id = "backup") {
  return tool("report_viewpoint", { item_id, viewpoint_id, status, answer_ids, reason: "理由" });
}

function ask(question_id: string) {
  return tool("ask_question", { item_id: "backup", question_id, text: "質問", why: "理由", options: [] });
}

function vendor(gap_type: string, viewpoint_id = "restore") {
  return tool("add_vendor_question", {
    item_id: "backup",
    gap_type,
    concern: "不安",
    question: "質問文",
    requirements: [{ viewpoint_id, text: "戻す確認をした" }],
  });
}

function setup() {
  const session = createSession("yes", "no_item");
  const events: InterviewEvent[] = [];
  return { session, events, emit: (event: InterviewEvent) => events.push(event) };
}

test("記録：回答のない report_viewpoint は状態を変えない", () => {
  const { session, emit } = setup();
  const [result] = processToolUses([report("acquire", "confirmed", [])], session, emit);
  assert.equal(result.is_error, true);
  assert.equal(session.states.acquire, "not_asked");
});

test("記録：存在しない回答 ID、観点、項目を拒否する", () => {
  const { session, emit } = setup();
  session.answerCount = 1;
  for (const block of [
    report("acquire", "confirmed", ["a2"]),
    report("other", "confirmed", ["a1"]),
    report("acquire", "confirmed", ["a1"], "patch"),
  ]) {
    assert.equal(processToolUses([block], session, emit)[0].is_error, true);
  }
  assert.equal(session.states.acquire, "not_asked");
});

test("記録：判定が変わったときだけ判定の通知を出す", () => {
  const { session, events, emit } = setup();
  session.answerCount = 2;
  processToolUses([report("acquire", "confirmed", ["a1"])], session, emit);
  assert.equal(events.some((event) => event.type === "verdict_updated"), false);
  processToolUses([report("restore", "unknown", ["a2"])], session, emit);
  assert.equal(events.some((event) => event.type === "verdict_updated"), true);
});

test("質問：最初は固定の質問だけを認め、文面は固定データを使う", () => {
  const { session, events, emit } = setup();
  assert.equal(processToolUses([ask("")], session, emit)[0].is_error, true);

  processToolUses([ask("backup_q1")], session, emit);
  const question = events.find((event) => event.type === "question");
  assert.equal(question?.type === "question" && question.text.includes("バックアップ"), true);
});

test("質問：2件目には is_error を返し、1件だけ保留する", () => {
  const { session, emit } = setup();
  const results = processToolUses([ask("backup_q1"), tool("ask_question", {}, "second")], session, emit);
  assert.equal(session.pendingQuestionId, "ask_question");
  assert.equal(results.length, 1);
  assert.equal(results[0].tool_use_id, "second");
  assert.equal(results[0].is_error, true);
});

test("質問：5問を超えると拒否する", () => {
  const { session, emit } = setup();
  session.questionCount = 5;
  assert.equal(processToolUses([ask("")], session, emit)[0].is_error, true);
});

test("確認事項：すき間の種類が事業者の回答と合わないと拒否する", () => {
  const { session, emit } = setup();
  assert.equal(processToolUses([vendor("not_applicable")], session, emit)[0].is_error, true);
  assert.equal(processToolUses([vendor("no_item")], session, emit)[0].is_error, undefined);
  assert.equal(processToolUses([vendor("outside")], session, emit)[0].is_error, undefined);
  assert.equal(session.vendorQuestions[0].requirements[0].id, "q1_r1");
  assert.equal(session.vendorQuestions[1].requirements[0].id, "q2_r1");
});

test("確認事項：存在しない観点を拒否する", () => {
  const { session, emit } = setup();
  assert.equal(processToolUses([vendor("no_item", "other")], session, emit)[0].is_error, true);
  assert.equal(session.vendorQuestions.length, 0);
});

test("終了：未確認の観点があれば拒否し、質問の上限に達していれば認める", () => {
  const { session, emit } = setup();
  const finish = tool("finish_item", { item_id: "backup", summary: "要約" });
  assert.equal(processToolUses([finish], session, emit)[0].is_error, true);
  assert.equal(session.finished, false);

  session.questionCount = 5;
  assert.equal(processToolUses([finish], session, emit)[0].is_error, undefined);
  assert.equal(session.finished, true);
});

test("終了：確認事項がなく穴があれば、固定の確認事項で補う", () => {
  const { session } = setup();
  assert.equal(vendorRequestFor(session), null);
  session.states.restore = "denied";
  assert.equal(vendorRequestFor(session)?.requirements.length, 4);
});

test("検証エラーが続いたら、その観点を「わからない」にして止める", () => {
  const { session, events, emit } = setup();
  session.states.acquire = "confirmed";
  const block = report("restore", "confirmed", []);
  const results = processToolUses([block], session, emit);
  giveUp([block], results, session, emit);
  assert.equal(session.states.restore, "unknown");
  assert.equal(session.finished, true);
  assert.equal(events.some((event) => event.type === "error"), true);
});
