import type { AnswerValue, UserIntent } from "@/lib/conversation/intent";
import type {
  ConversationSession,
  ConversationState
} from "@/lib/conversation/state";
import type { QualificationQuestionId } from "@/lib/conversation/qualification";

export type GoldenTranscriptTurn = {
  intent: UserIntent;
  expectedState: ConversationState;
  expectedQuestionId?: QualificationQuestionId | null;
  expectedRebootStepIndex?: number;
  assistantIncludes?: string[];
};

export type GoldenTranscriptFixture = {
  name: string;
  description: string;
  startingSession?: ConversationSession;
  turns: GoldenTranscriptTurn[];
  expectedFinalState: ConversationState;
};

export const goldenTranscriptFixtures: GoldenTranscriptFixture[] = [
  {
    name: "happy_path_resolved",
    description:
      "A general multi-device outage qualifies for reboot, completes the steps, and ends resolved.",
    expectedFinalState: "RESOLVED_EXIT",
    turns: [
      step(answer("yes"), "QUALIFYING", "deviceImpact", [
        "one device or multiple devices"
      ]),
      step(answer("multiple_devices"), "QUALIFYING", "connectivityScope", [
        "general WiFi or internet problem"
      ]),
      step(answer("general_connectivity"), "QUALIFYING", "equipmentStatus", [
        "modem and router powered on"
      ]),
      step(answer("yes"), "QUALIFYING", "knownOutage", [
        "internet service provider outage"
      ]),
      step(answer("no"), "QUALIFYING", "canAccessEquipment", [
        "safely reach the router and modem power cords"
      ]),
      step(answer("yes"), "QUALIFYING", "acceptsTemporaryInterruption", [
        "temporarily disconnect the internet"
      ]),
      step(answer("yes"), "REBOOT_INTRO", null, [
        "router reboot is appropriate"
      ]),
      step(answer("yes"), "REBOOT_STEP_1", null, ["Step 1 of 6"], 0),
      step(completion(), "REBOOT_STEP_2", null, ["Step 2 of 6"], 1),
      step(completion(), "REBOOT_STEP_3", null, ["Step 3 of 6"], 2),
      step(completion(), "REBOOT_STEP_4", null, ["Step 4 of 6"], 3),
      step(completion(), "REBOOT_STEP_5", null, ["Step 5 of 6"], 4),
      step(completion(), "REBOOT_STEP_6", null, ["Step 6 of 6"], 5),
      step(completion(), "CHECK_RESOLUTION", null, [
        "issue resolved"
      ]),
      step(answer("yes"), "RESOLVED_EXIT", null, ["all set"])
    ]
  },
  {
    name: "single_device_exit",
    description:
      "A single-device issue exits early because reboot is not the right first step.",
    expectedFinalState: "NOT_APPROPRIATE_EXIT",
    turns: [
      step(answer("yes"), "QUALIFYING", "deviceImpact"),
      step(answer("single_device"), "NOT_APPROPRIATE_EXIT", null, [
        "only one device"
      ])
    ]
  },
  {
    name: "specific_service_exit",
    description:
      "A service-specific problem exits early instead of starting the reboot flow.",
    expectedFinalState: "NOT_APPROPRIATE_EXIT",
    turns: [
      step(answer("yes"), "QUALIFYING", "deviceImpact"),
      step(answer("multiple_devices"), "QUALIFYING", "connectivityScope"),
      step(answer("specific_service"), "NOT_APPROPRIATE_EXIT", null, [
        "only one app or website"
      ])
    ]
  },
  {
    name: "known_outage_exit",
    description:
      "A known ISP outage exits before reboot because the problem is upstream.",
    expectedFinalState: "NOT_APPROPRIATE_EXIT",
    turns: [
      step(answer("yes"), "QUALIFYING", "deviceImpact"),
      step(answer("multiple_devices"), "QUALIFYING", "connectivityScope"),
      step(answer("general_connectivity"), "QUALIFYING", "equipmentStatus"),
      step(answer("yes"), "QUALIFYING", "knownOutage"),
      step(answer("yes"), "NOT_APPROPRIATE_EXIT", null, [
        "internet service provider outage"
      ])
    ]
  },
  {
    name: "reboot_unresolved_exit",
    description:
      "A qualified reboot can still end unresolved and should exit helpfully.",
    expectedFinalState: "UNRESOLVED_EXIT",
    turns: [
      step(answer("yes"), "QUALIFYING", "deviceImpact"),
      step(answer("multiple_devices"), "QUALIFYING", "connectivityScope"),
      step(answer("general_connectivity"), "QUALIFYING", "equipmentStatus"),
      step(answer("yes"), "QUALIFYING", "knownOutage"),
      step(answer("no"), "QUALIFYING", "canAccessEquipment"),
      step(answer("yes"), "QUALIFYING", "acceptsTemporaryInterruption"),
      step(answer("yes"), "REBOOT_INTRO", null),
      step(answer("yes"), "REBOOT_STEP_1", null, ["Step 1 of 6"], 0),
      step(completion(), "REBOOT_STEP_2", null, ["Step 2 of 6"], 1),
      step(completion(), "REBOOT_STEP_3", null, ["Step 3 of 6"], 2),
      step(completion(), "REBOOT_STEP_4", null, ["Step 4 of 6"], 3),
      step(completion(), "REBOOT_STEP_5", null, ["Step 5 of 6"], 4),
      step(completion(), "REBOOT_STEP_6", null, ["Step 6 of 6"], 5),
      step(completion(), "CHECK_RESOLUTION", null),
      step(answer("no"), "UNRESOLVED_EXIT", null, [
        "Linksys support"
      ])
    ]
  },
  {
    name: "user_declines_reboot",
    description:
      "User says no at REBOOT_INTRO and the session ends gracefully without starting the steps.",
    expectedFinalState: "NOT_APPROPRIATE_EXIT",
    turns: [
      step(answer("yes"), "QUALIFYING", "deviceImpact"),
      step(answer("multiple_devices"), "QUALIFYING", "connectivityScope"),
      step(answer("general_connectivity"), "QUALIFYING", "equipmentStatus"),
      step(answer("yes"), "QUALIFYING", "knownOutage"),
      step(answer("no"), "QUALIFYING", "canAccessEquipment"),
      step(answer("yes"), "QUALIFYING", "acceptsTemporaryInterruption"),
      step(answer("yes"), "REBOOT_INTRO", null, ["router reboot is appropriate"]),
      step(answer("no"), "NOT_APPROPRIATE_EXIT", null, ["safe and convenient"])
    ]
  },
  {
    name: "question_during_qualification",
    description:
      "A question during qualification stays on the current question without advancing.",
    expectedFinalState: "QUALIFYING",
    turns: [
      step(answer("yes"), "QUALIFYING", "deviceImpact"),
      step(answer("multiple_devices"), "QUALIFYING", "connectivityScope"),
      step(
        question("Why do you need to know this?"),
        "QUALIFYING",
        "connectivityScope",
        ["general WiFi or internet problem"]
      ),
      step(answer("general_connectivity"), "QUALIFYING", "equipmentStatus", [
        "modem and router powered on"
      ])
    ]
  },
  {
    name: "mid_step_question_does_not_advance",
    description:
      "A reboot-step question should clarify the active step and preserve step order.",
    expectedFinalState: "CHECK_RESOLUTION",
    turns: [
      step(answer("yes"), "QUALIFYING", "deviceImpact"),
      step(answer("multiple_devices"), "QUALIFYING", "connectivityScope"),
      step(answer("general_connectivity"), "QUALIFYING", "equipmentStatus"),
      step(answer("yes"), "QUALIFYING", "knownOutage"),
      step(answer("no"), "QUALIFYING", "canAccessEquipment"),
      step(answer("yes"), "QUALIFYING", "acceptsTemporaryInterruption"),
      step(answer("yes"), "REBOOT_INTRO", null),
      step(answer("yes"), "REBOOT_STEP_1", null, ["Step 1 of 6"], 0),
      step(question("What color is the power cord?"), "REBOOT_STEP_1", null, [
        "clarify the current reboot step",
        "Step 1"
      ], 0),
      step(completion(), "REBOOT_STEP_2", null, ["Step 2 of 6"], 1),
      step(completion(), "REBOOT_STEP_3", null, ["Step 3 of 6"], 2),
      step(completion(), "REBOOT_STEP_4", null, ["Step 4 of 6"], 3),
      step(completion(), "REBOOT_STEP_5", null, ["Step 5 of 6"], 4),
      step(completion(), "REBOOT_STEP_6", null, ["Step 6 of 6"], 5),
      step(completion(), "CHECK_RESOLUTION", null, [
        "issue resolved"
      ])
    ]
  }
];

function step(
  intent: UserIntent,
  expectedState: ConversationState,
  expectedQuestionId?: QualificationQuestionId | null,
  assistantIncludes?: string[],
  expectedRebootStepIndex?: number
): GoldenTranscriptTurn {
  return {
    intent,
    expectedState,
    expectedQuestionId,
    assistantIncludes,
    expectedRebootStepIndex
  };
}

function answer(value: AnswerValue): UserIntent {
  return { type: "answer", value };
}

function completion(): UserIntent {
  return { type: "completion" };
}

function question(text: string): UserIntent {
  return { type: "question", text };
}
