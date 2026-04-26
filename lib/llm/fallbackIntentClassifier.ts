import type { AnswerValue, UserIntent } from "@/lib/conversation/intent";
import type {
  ConversationSession,
  ConversationState
} from "@/lib/conversation/state";
import { hasAny, normalizeInput } from "@/lib/conversation/text";

export type FallbackClassifyUserIntentInput = {
  userInput: string;
  session: ConversationSession;
};

export function fallbackClassifyUserIntent({
  userInput,
  session
}: FallbackClassifyUserIntentInput): UserIntent {
  const normalized = normalizeInput(userInput);
  const answerValue = getFallbackAnswerValue(normalized, session.state);

  if (answerValue) {
    return {
      type: "answer",
      value: answerValue,
      text: userInput
    };
  }

  if (isCompletion(normalized, session.state)) {
    return {
      type: "completion",
      text: userInput
    };
  }

  if (isGreeting(normalized)) {
    return {
      type: "greeting",
      text: userInput
    };
  }

  if (isQuestion(userInput, normalized)) {
    return {
      type: "question",
      text: userInput
    };
  }

  return {
    type: "unknown",
    text: userInput
  };
}

function getFallbackAnswerValue(
  normalizedInput: string,
  state: ConversationState
): AnswerValue | null {
  const connectivityScope = getConnectivityScopeValue(normalizedInput);
  const deviceImpact = getDeviceImpactValue(normalizedInput);

  if (state === "START") {
    if (connectivityScope) {
      return connectivityScope;
    }

    return deviceImpact && hasIssueContext(normalizedInput)
      ? deviceImpact
      : null;
  }

  if (connectivityScope) {
    return connectivityScope;
  }

  if (deviceImpact) {
    return deviceImpact;
  }

  return getConfirmationValue(normalizedInput);
}

function getConnectivityScopeValue(
  normalizedInput: string
): AnswerValue | null {
  if (
    hasAny(normalizedInput, [
      "not just one app",
      "not only one app",
      "every app",
      "all websites",
      "everything",
      "nothing loads",
      "internet is down",
      "wifi is down",
      "wi fi is down",
      "no internet"
    ])
  ) {
    return "general_connectivity";
  }

  if (
    hasAny(normalizedInput, [
      "only one app",
      "only one website",
      "just netflix",
      "just youtube",
      "just email"
    ])
  ) {
    return "specific_service";
  }

  return null;
}

function getDeviceImpactValue(normalizedInput: string): AnswerValue | null {
  if (
    hasAny(normalizedInput, [
      "multiple",
      "several",
      "some devices",
      "multiple devices",
      "several devices",
      "all devices",
      "every device",
      "whole house"
    ])
  ) {
    return "multiple_devices";
  }

  if (
    hasAny(normalizedInput, [
      "one device",
      "single device",
      "only one device",
      "only my phone",
      "only my laptop"
    ])
  ) {
    return "single_device";
  }

  return null;
}

function hasIssueContext(normalizedInput: string): boolean {
  return hasAny(normalizedInput, [
    "internet",
    "wifi",
    "wi fi",
    "connect",
    "connection",
    "offline",
    "down",
    "loads",
    "working",
    "broken"
  ]);
}

function getConfirmationValue(normalizedInput: string): AnswerValue | null {
  if (
    hasAny(normalizedInput, [
      "not sure",
      "unsure",
      "unknown",
      "i don't know",
      "i dont know",
      "maybe"
    ])
  ) {
    return "unsure";
  }

  if (
    hasAny(normalizedInput, [
      "no",
      "nope",
      "can't",
      "cannot",
      "cant",
      "don't",
      "dont",
      "won't",
      "wont"
    ])
  ) {
    return "no";
  }

  if (
    hasAny(normalizedInput, [
      "yes",
      "yeah",
      "yep",
      "sure",
      "ok",
      "okay",
      "ready",
      "go ahead"
    ])
  ) {
    return "yes";
  }

  return null;
}

function isCompletion(
  normalizedInput: string,
  state: ConversationState
): boolean {
  if (hasAny(normalizedInput, ["done", "completed", "complete", "finished"])) {
    return true;
  }

  return (
    state.startsWith("REBOOT_STEP_") &&
    hasAny(normalizedInput, [
      "waited",
      "reconnected",
      "connected",
      "plugged",
      "plugged in",
      "disconnected",
      "unplugged"
    ])
  );
}

function isGreeting(normalizedInput: string): boolean {
  return (
    normalizedInput === "hi" ||
    normalizedInput === "hello" ||
    normalizedInput === "hey"
  );
}

function isQuestion(rawInput: string, normalizedInput: string): boolean {
  return (
    rawInput.includes("?") ||
    hasAny(normalizedInput, [
      "what",
      "why",
      "how",
      "where",
      "when",
      "can i",
      "should i"
    ])
  );
}

