import { describe, expect, it } from "vitest";
import { advanceConversation } from "@/lib/conversation/engine";
import { createInitialConversationSession } from "@/lib/conversation/state";
import {
  goldenTranscriptFixtures,
  type GoldenTranscriptFixture
} from "./golden-transcript-fixtures";

describe("golden transcript harness", () => {
  for (const fixture of goldenTranscriptFixtures) {
    it(fixture.name, () => {
      runGoldenTranscript(fixture);
    });
  }
});

function runGoldenTranscript(fixture: GoldenTranscriptFixture): void {
  let session = fixture.startingSession ?? createInitialConversationSession();

  fixture.turns.forEach((turn, index) => {
    const result = advanceConversation(session, turn.intent);

    expect(
      result.session.state,
      formatTurnMessage(fixture, index, "state")
    ).toBe(turn.expectedState);

    if (turn.expectedQuestionId !== undefined) {
      expect(
        result.session.currentQuestionId,
        formatTurnMessage(fixture, index, "question id")
      ).toBe(turn.expectedQuestionId);
    }

    if (turn.expectedRebootStepIndex !== undefined) {
      expect(
        result.session.rebootStepIndex,
        formatTurnMessage(fixture, index, "reboot step index")
      ).toBe(turn.expectedRebootStepIndex);
    }

    for (const fragment of turn.assistantIncludes ?? []) {
      expect(
        result.assistantMessage,
        formatTurnMessage(fixture, index, `assistant text: ${fragment}`)
      ).toContain(fragment);
    }

    session = result.session;
  });

  expect(session.state, `${fixture.name}: final state`).toBe(
    fixture.expectedFinalState
  );
}

function formatTurnMessage(
  fixture: GoldenTranscriptFixture,
  turnIndex: number,
  field: string
): string {
  return `${fixture.name} turn ${turnIndex + 1}: expected ${field}`;
}
