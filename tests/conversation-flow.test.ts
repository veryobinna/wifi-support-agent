import { describe, expect, it } from "vitest";
import {
  advanceConversation,
  type ConversationTurn
} from "@/lib/conversation/engine";
import type {
  AnswerValue,
  UserIntent
} from "@/lib/conversation/intent";
import { rebootSteps } from "@/lib/conversation/rebootSteps";
import {
  createInitialConversationSession,
  type ConversationSession,
  type ConversationState
} from "@/lib/conversation/state";

describe("conversation flow transcripts", () => {
  it("guides an appropriate issue through reboot and resolved exit", () => {
    const transcript = runTranscript([
      answer("yes"),
      answer("multiple_devices"),
      answer("general_connectivity"),
      answer("yes"),
      answer("no"),
      answer("yes"),
      answer("yes"),
      answer("yes"),
      ...Array.from({ length: rebootSteps.length }, () => completion()),
      answer("yes")
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

  it("does not advance from START for a greeting", () => {
    const turn = advanceConversation(
      createInitialConversationSession(),
      greeting("hello")
    );

    expect(turn.session.state).toBe("START");
    expect(turn.session.currentQuestionId).toBeNull();
    expect(turn.assistantMessage).toContain("What WiFi or internet issue");
  });

  it("does not advance from START for an unknown message", () => {
    const turn = advanceConversation(
      createInitialConversationSession(),
      unknown("Okay")
    );

    expect(turn.session.state).toBe("START");
    expect(turn.session.currentQuestionId).toBeNull();
    expect(turn.assistantMessage).toContain("What WiFi or internet issue");
  });

  it("keeps START in control when the user asks a question", () => {
    const turn = advanceConversation(
      createInitialConversationSession(),
      question("What problem?")
    );

    expect(turn.session.state).toBe("START");
    expect(turn.session.currentQuestionId).toBeNull();
    expect(turn.assistantMessage).toContain("What WiFi or internet issue");
  });

  it("exits gracefully when the issue only affects one device", () => {
    const transcript = runTranscript([
      answer("yes"),
      answer("single_device")
    ]);

    expect(lastTurn(transcript).session.state).toBe("NOT_APPROPRIATE_EXIT");
    expect(lastTurn(transcript).assistantMessage).toContain(
      "only one device"
    );
  });

  it("exits gracefully when there is a known provider outage", () => {
    const transcript = runTranscript([
      answer("yes"),
      answer("multiple_devices"),
      answer("general_connectivity"),
      answer("yes"),
      answer("yes")
    ]);

    expect(lastTurn(transcript).session.state).toBe("NOT_APPROPRIATE_EXIT");
    expect(lastTurn(transcript).assistantMessage).toContain(
      "internet service provider outage"
    );
  });

  it("exits gracefully when the user cannot safely reach the equipment", () => {
    const transcript = runTranscript([
      answer("yes"),
      answer("multiple_devices"),
      answer("general_connectivity"),
      answer("yes"),
      answer("no"),
      answer("no")
    ]);

    expect(lastTurn(transcript).session.state).toBe("NOT_APPROPRIATE_EXIT");
    expect(lastTurn(transcript).assistantMessage).toContain("safely reach");
  });

  it("ends helpfully when reboot does not resolve the issue", () => {
    const transcript = runTranscript([
      answer("yes"),
      answer("multiple_devices"),
      answer("general_connectivity"),
      answer("yes"),
      answer("no"),
      answer("yes"),
      answer("yes"),
      answer("yes"),
      ...Array.from({ length: rebootSteps.length }, () => completion()),
      answer("no")
    ]);

    expect(lastTurn(transcript).session.state).toBe("UNRESOLVED_EXIT");
    expect(lastTurn(transcript).assistantMessage).toContain(
      "contact your internet service provider or Linksys support"
    );
  });

  it("retries when a qualification answer is unclear", () => {
    const transcript = runTranscript([
      answer("yes"),
      unknown("maybe")
    ]);

    expect(lastTurn(transcript).session.state).toBe("QUALIFYING");
    expect(lastTurn(transcript).session.currentQuestionId).toBe("deviceImpact");
    expect(lastTurn(transcript).assistantMessage).toContain(
      "one device, or are multiple devices"
    );
  });

  it("keeps qualification in control when the user asks a question", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "QUALIFYING",
      currentQuestionId: "deviceImpact"
    };

    const turn = advanceConversation(session, question("What is a reboot?"));

    expect(turn.session.state).toBe("QUALIFYING");
    expect(turn.session.currentQuestionId).toBe("deviceImpact");
    expect(turn.assistantMessage).toContain(
      "one device or multiple devices"
    );
  });

  it("maps answer values through the active qualification question", () => {
    let session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "QUALIFYING",
      currentQuestionId: "connectivityScope"
    };

    let turn = advanceConversation(session, answer("general_connectivity"));
    expect(turn.session.qualification.connectivityScope).toBe(
      "general_connectivity"
    );

    session = {
      ...createInitialConversationSession(),
      state: "QUALIFYING",
      currentQuestionId: "connectivityScope"
    };

    turn = advanceConversation(session, answer("specific_service"));
    expect(turn.session.state).toBe("NOT_APPROPRIATE_EXIT");
    expect(turn.session.qualification.connectivityScope).toBe(
      "specific_service"
    );
  });

  it("explains how to check for an ISP outage and stays on the question", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "QUALIFYING",
      currentQuestionId: "knownOutage"
    };

    const turn = advanceConversation(session, question("How can I know?"));

    expect(turn.session.state).toBe("QUALIFYING");
    expect(turn.session.currentQuestionId).toBe("knownOutage");
    expect(turn.assistantMessage).toContain("ISP's outage page");
    expect(turn.assistantMessage).toContain("not sure");
    expect(turn.assistantMessage).toContain(
      "Do you know of an internet service provider outage"
    );
  });

  it("accepts not sure as a valid known-outage answer", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "QUALIFYING",
      currentQuestionId: "knownOutage"
    };

    const turn = advanceConversation(session, answer("unsure"));

    expect(turn.session.state).toBe("QUALIFYING");
    expect(turn.session.qualification.knownOutage).toBe(false);
    expect(turn.session.currentQuestionId).toBe("deviceImpact");
  });

  it("keeps reboot intro in control when the user asks a question", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "REBOOT_INTRO"
    };

    const turn = advanceConversation(
      session,
      question("Should I press the Reset button?")
    );

    expect(turn.session.state).toBe("REBOOT_INTRO");
    expect(turn.assistantMessage).toContain("ready to begin");
    expect(turn.assistantMessage).toContain("Reset button");
  });

  it("keeps reboot steps in control when the user asks a question", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "REBOOT_STEP_4",
      rebootStepIndex: 3
    };

    const turn = advanceConversation(
      session,
      question("How long should this take?")
    );

    expect(turn.session.state).toBe("REBOOT_STEP_4");
    expect(turn.session.rebootStepIndex).toBe(3);
    expect(turn.assistantMessage).toContain("clarify the current reboot step");
    expect(turn.assistantMessage).toContain("Step 4");
  });

  it("explains how to identify the power cord without advancing", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "REBOOT_STEP_1",
      rebootStepIndex: 0
    };

    const turn = advanceConversation(
      session,
      question("What color is it? There are many cords here")
    );

    expect(turn.session.state).toBe("REBOOT_STEP_1");
    expect(turn.assistantMessage).toContain("clarify the current reboot step");
    expect(turn.assistantMessage).toContain("Step 1");
  });

  it("handles an issue overview intent through normal state flow", () => {
    const turn = advanceConversation(
      createInitialConversationSession(),
      answer("yes")
    );

    expect(turn.session.state).toBe("QUALIFYING");
    expect(turn.session.currentQuestionId).toBe("deviceImpact");
  });

  it("retries when the user does not confirm reboot step completion", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "REBOOT_STEP_1",
      rebootStepIndex: 0
    };

    const turn = advanceConversation(session, unknown("I need a minute"));

    expect(turn.session.state).toBe("REBOOT_STEP_1");
    expect(turn.assistantMessage).toContain("Take your time");
    expect(turn.assistantMessage).toContain("Step 1");
  });

  it("advances a wait step on completion", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "REBOOT_STEP_2",
      rebootStepIndex: 1
    };

    const turn = advanceConversation(session, completion());

    expect(turn.session.state).toBe("REBOOT_STEP_3");
    expect(turn.assistantMessage).toContain("Reconnect the modem power cord");
  });

  it("does not treat ok as reboot step completion", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "REBOOT_STEP_2",
      rebootStepIndex: 1
    };

    const turn = advanceConversation(session, answer("yes"));

    expect(turn.session.state).toBe("REBOOT_STEP_2");
    expect(turn.assistantMessage).toContain("not complete yet");
  });

  it("handles a no-power blocker during a reconnect step", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "REBOOT_STEP_3",
      rebootStepIndex: 2
    };

    const turn = advanceConversation(session, answer("no"));

    expect(turn.session.state).toBe("REBOOT_STEP_3");
    expect(turn.assistantMessage).toContain("not complete yet");
    expect(turn.assistantMessage).toContain("Step 3");
  });

  it("does not restart a terminal conversation", () => {
    const session: ConversationSession = {
      ...createInitialConversationSession(),
      state: "RESOLVED_EXIT"
    };

    const turn = advanceConversation(session, unknown("I still need help"));

    expect(turn.session.state).toBe("RESOLVED_EXIT");
    expect(turn.assistantMessage).toContain("session has ended");
  });
});

function runTranscript(inputs: UserIntent[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let session = createInitialConversationSession();

  for (const intent of inputs) {
    const turn = advanceConversation(session, intent);
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

function answer(value: AnswerValue): UserIntent {
  return {
    type: "answer",
    value
  };
}

function completion(): UserIntent {
  return { type: "completion" };
}

function question(text: string): UserIntent {
  return {
    type: "question",
    text
  };
}

function greeting(text: string): UserIntent {
  return {
    type: "greeting",
    text
  };
}

function unknown(text: string): UserIntent {
  return {
    type: "unknown",
    text
  };
}
