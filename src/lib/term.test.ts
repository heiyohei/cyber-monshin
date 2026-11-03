import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { BACKUP_ITEM } from "../data/backup.ts";
import { createSession } from "./session.ts";
import { currentQuestion } from "./term.ts";

test("ことばの相談：今の質問は署名された履歴から取り出す", () => {
  const session = createSession("yes", "no_item");
  assert.equal(currentQuestion(session), "");

  session.pendingQuestionId = "q1";
  session.questionCount = 1;
  assert.equal(currentQuestion(session), BACKUP_ITEM.firstQuestion.text);

  session.questionCount = 2;
  session.pendingQuestionId = "q2";
  session.messages = [
    {
      role: "assistant",
      content: [
        { type: "tool_use", id: "q2", name: "ask_question", input: { text: "控えはどこに置いていますか？" } },
      ] as Anthropic.Beta.BetaContentBlockParam[],
    },
  ];
  assert.equal(currentQuestion(session), "控えはどこに置いていますか？");
});
