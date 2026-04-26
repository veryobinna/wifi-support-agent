import { describe, expect, it } from "vitest";
import { createInitialConversationSession } from "@/lib/conversation/state";
import { fallbackClassifyUserIntent } from "@/lib/llm/fallbackIntentClassifier";

describe("fallback intent classifier", () => {
  it("classifies a greeting without inventing a problem", () => {
    const intent = fallbackClassifyUserIntent({
      userInput: "hello",
      session: createInitialConversationSession()
    });

    expect(intent).toMatchObject({
      type: "greeting"
    });
  });


  it("treats an obvious issue description with a question mark as an answer", () => {
    const intent = fallbackClassifyUserIntent({
      userInput: "My WiFi is down?",
      session: createInitialConversationSession()
    });

    expect(intent).toMatchObject({
      type: "answer",
      value: "yes"
    });
  });

  it("does not treat device-count words alone as a START issue", () => {
    const intent = fallbackClassifyUserIntent({
      userInput: "multiple devices",
      session: createInitialConversationSession()
    });

    expect(intent).toMatchObject({
      type: "unknown"
    });
  });

  it("classifies short multiple-device answers during qualification", () => {
    const session = {
      ...createInitialConversationSession(),
      state: "QUALIFYING" as const,
      currentQuestionId: "deviceImpact" as const
    };

    expect(
      fallbackClassifyUserIntent({
        userInput: "Multiple",
        session
      })
    ).toMatchObject({
      type: "answer",
      value: "multiple_devices"
    });

    expect(
      fallbackClassifyUserIntent({
        userInput: "it affects some devices too, but some work perfectly",
        session
      })
    ).toMatchObject({
      type: "answer",
      value: "multiple_devices"
    });
  });

  it("classifies an outage clarification as a question", () => {
    const intent = fallbackClassifyUserIntent({
      userInput: "How can I know?",
      session: {
        ...createInitialConversationSession(),
        state: "QUALIFYING",
        currentQuestionId: "knownOutage"
      }
    });

    expect(intent).toMatchObject({
      type: "question"
    });
  });

  it("classifies waited time wording as step completion", () => {
    const intent = fallbackClassifyUserIntent({
      userInput: "I have waited 50 seconds",
      session: {
        ...createInitialConversationSession(),
        state: "REBOOT_STEP_2",
        rebootStepIndex: 1
      }
    });

    expect(intent).toMatchObject({ type: "completion" });
  });

  it("classifies reconnect wording as step completion", () => {
    const intent = fallbackClassifyUserIntent({
      userInput: "it has been reconnected",
      session: {
        ...createInitialConversationSession(),
        state: "REBOOT_STEP_5",
        rebootStepIndex: 4
      }
    });

    expect(intent).toMatchObject({
      type: "completion"
    });
  });

  it("prefers general connectivity for not-just-one-app wording", () => {
    const intent = fallbackClassifyUserIntent({
      userInput: "Not just one app, but every app I visit",
      session: {
        ...createInitialConversationSession(),
        state: "QUALIFYING",
        currentQuestionId: "connectivityScope"
      }
    });

    expect(intent).toMatchObject({
      type: "answer",
      value: "general_connectivity"
    });
  });

  it("classifies obvious single app or website issues as specific service", () => {
    const intent = fallbackClassifyUserIntent({
      userInput: "Only one website is broken",
      session: {
        ...createInitialConversationSession(),
        state: "QUALIFYING",
        currentQuestionId: "connectivityScope"
      }
    });

    expect(intent).toMatchObject({
      type: "answer",
      value: "specific_service"
    });
  });
});
