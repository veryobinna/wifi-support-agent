import { describe, expect, it } from "vitest";
import { rebootSteps } from "@/lib/conversation/rebootSteps";
import {
  createInitialConversationSession,
  type ConversationSession,
  type ConversationState
} from "@/lib/conversation/state";
import {
  advanceConversation,
  type ConversationTurn
} from "@/lib/conversation/engine";

describe("conversation flow transcripts", () => {
  it("guides an appropriate issue through reboot and resolved exit", () => {
    const transcript = runTranscript([
      "The internet is down in the house.",
      "multiple devices",
      "general internet problem",
      "yes, the modem and router are powered and connected",
      "no known outage",
      "yes, I can safely reach them",
      "yes, now is okay",
      "ready",
      ...Array.from({ length: rebootSteps.length }, () => "done"),
      "yes"
    ]);

    expect(states(transcript)).toEqual([
      "QUALIFYING",
      "QUALIFYING",
      "QUALIFYING",
      "QUALIFYING",
      "QUALIFYING",
      "QUALIFYING",
      "REBOOT_INTRO",
      "REBOOT_STEP_1",
      "REBOOT_STEP_2",
      "REBOOT_STEP_3",
      "REBOOT_STEP_4",
      "REBOOT_STEP_5",
      "REBOOT_STEP_6",
      "CHECK_RESOLUTION",
      "RESOLVED_EXIT"
    ]);
    expect(lastTurn(transcript).assistantMessage).toContain("all set");
  });

  it("exits gracefully when the issue only affects one device", () => {
    const transcript = runTranscript([
      "My phone cannot connect to WiFi.",
      "only my phone"
    ]);

    expect(lastTurn(transcript).session.state).toBe("NOT_APPROPRIATE_EXIT");
    expect(lastTurn(transcript).assistantMessage).toContain(
      "only one device"
    );
  });

  it("exits gracefully when there is a known provider outage", () => {
    const transcript = runTranscript([
      "The internet is down.",
      "multiple devices",
      "general internet problem",
      "yes, the cables are connected",
      "yes, there is an ISP outage"
    ]);

    expect(lastTurn(transcript).session.state).toBe("NOT_APPROPRIATE_EXIT");
    expect(lastTurn(transcript).assistantMessage).toContain(
      "known internet service provider outage"
    );
  });

  it("exits gracefully when the user cannot safely reach the equipment", () => {
    const transcript = runTranscript([
      "The WiFi is down.",
      "multiple devices",
      "general internet problem",
      "yes, everything is connected",
      "no known outage",
      "no, I cannot reach the router safely"
    ]);

    expect(lastTurn(transcript).session.state).toBe("NOT_APPROPRIATE_EXIT");
    expect(lastTurn(transcript).assistantMessage).toContain("safely reach");
  });

  it("ends helpfully when reboot does not resolve the issue", () => {
    const transcript = runTranscript([
      "The internet is down.",
      "multiple devices",
      "general internet problem",
      "yes, the modem and router are connected",
      "no known outage",
      "yes, I can reach them",
      "yes, now is okay",
      "ready",
      ...Array.from({ length: rebootSteps.length }, () => "done"),
      "no"
    ]);

    expect(lastTurn(transcript).session.state).toBe("UNRESOLVED_EXIT");
    expect(lastTurn(transcript).assistantMessage).toContain(
      "contact your internet service provider or Linksys support"
    );
  });

  it("retries when a qualification answer is unclear", () => {
    const transcript = runTranscript(["My internet is down.", "maybe"]);

    expect(lastTurn(transcript).session.state).toBe("QUALIFYING");
    expect(lastTurn(transcript).session.currentQuestionId).toBe("deviceImpact");
    expect(lastTurn(transcript).assistantMessage).toContain(
      "one device, or are multiple devices"
    );
  });

  it("retries when the user does not confirm reboot step completion", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "REBOOT_STEP_1",
      rebootStepIndex: 0
    };

    const turn = advanceConversation(session, "I need a minute");

    expect(turn.session.state).toBe("REBOOT_STEP_1");
    expect(turn.assistantMessage).toContain("Take your time");
    expect(turn.assistantMessage).toContain("Step 1");
  });

  it("does not restart a terminal conversation", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "RESOLVED_EXIT"
    };

    const turn = advanceConversation(session, "I still need help");

    expect(turn.session.state).toBe("RESOLVED_EXIT");
    expect(turn.assistantMessage).toContain("conversation has ended");
  });
});

function runTranscript(inputs: string[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let session = createInitialConversationSession();

  for (const input of inputs) {
    const turn = advanceConversation(session, input);
    turns.push(turn);
    session = turn.session;
  }

  return turns;
}

function states(turns: ConversationTurn[]): ConversationState[] {
  return turns.map((turn) => turn.session.state);
}

function lastTurn(turns: ConversationTurn[]): ConversationTurn {
  const turn = turns.at(-1);

  if (!turn) {
    throw new Error("Transcript did not include any turns.");
  }

  return turn;
}
