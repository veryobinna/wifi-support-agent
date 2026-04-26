import { describe, expect, it } from "vitest";
import { advanceConversation } from "@/lib/conversation/engine";
import { rebootSteps } from "@/lib/conversation/rebootSteps";
import { createInitialConversationSession } from "@/lib/conversation/state";
import {
  decideRebootAppropriateness,
  type QualificationAnswers
} from "@/lib/conversation/qualification";

describe("qualification", () => {
  it("marks a multi-device general outage as appropriate for reboot", () => {
    const answers: QualificationAnswers = {
      deviceImpact: "multiple_devices",
      connectivityScope: "general_connectivity",
      equipmentStatus: "powered_and_connected",
      knownOutage: false,
      canAccessEquipment: true,
      acceptsTemporaryInterruption: true
    };

    expect(decideRebootAppropriateness(answers)).toMatchObject({
      status: "appropriate"
    });
  });

  it("exits gracefully when only one device is affected", () => {
    expect(
      decideRebootAppropriateness({
        deviceImpact: "single_device"
      })
    ).toMatchObject({
      status: "not_appropriate"
    });
  });

  it("exits gracefully when there is a known ISP outage", () => {
    expect(
      decideRebootAppropriateness({
        deviceImpact: "multiple_devices",
        connectivityScope: "general_connectivity",
        equipmentStatus: "powered_and_connected",
        knownOutage: true
      })
    ).toMatchObject({
      status: "not_appropriate"
    });
  });
});

describe("conversation engine", () => {
  it("asks a qualifying question after the user describes the issue", () => {
    const turn = advanceConversation(createInitialConversationSession(), {
      type: "answer",
      value: "yes"
    });

    expect(turn.session.state).toBe("QUALIFYING");
    expect(turn.session.currentQuestionId).toBe("deviceImpact");
    expect(turn.assistantMessage).toContain("one device or multiple devices");
  });

  it("moves an appropriate issue into the reboot introduction", () => {
    let session = createInitialConversationSession();

    session = advanceConversation(session, {
      type: "answer",
      value: "yes"
    }).session;
    session = advanceConversation(session, {
      type: "answer",
      value: "multiple_devices"
    }).session;
    session = advanceConversation(session, {
      type: "answer",
      value: "general_connectivity"
    }).session;
    session = advanceConversation(session, {
      type: "answer",
      value: "yes"
    }).session;
    session = advanceConversation(session, {
      type: "answer",
      value: "no"
    }).session;
    session = advanceConversation(session, {
      type: "answer",
      value: "yes"
    }).session;

    const turn = advanceConversation(session, {
      type: "answer",
      value: "yes"
    });

    expect(turn.session.state).toBe("REBOOT_INTRO");
    expect(turn.assistantMessage).toContain("factory reset");
  });

  it("walks through all reboot steps before checking resolution", () => {
    const session = {
      ...createInitialConversationSession(),
      state: "REBOOT_INTRO" as const
    };

    let turn = advanceConversation(session, {
      type: "answer",
      value: "yes"
    });
    expect(turn.session.state).toBe("REBOOT_STEP_1");

    for (let index = 1; index < rebootSteps.length; index += 1) {
      turn = advanceConversation(turn.session, {
        type: "completion"
      });
      expect(turn.session.state).toBe(`REBOOT_STEP_${index + 1}`);
    }

    turn = advanceConversation(turn.session, {
      type: "completion"
    });

    expect(turn.session.state).toBe("CHECK_RESOLUTION");
    expect(turn.assistantMessage).toContain("issue resolved");
  });

  it("ends helpfully when the reboot does not resolve the issue", () => {
    const session = {
      ...createInitialConversationSession(),
      state: "CHECK_RESOLUTION" as const
    };

    const turn = advanceConversation(session, {
      type: "answer",
      value: "no"
    });

    expect(turn.session.state).toBe("UNRESOLVED_EXIT");
    expect(turn.assistantMessage).toContain("sorry");
  });
});
