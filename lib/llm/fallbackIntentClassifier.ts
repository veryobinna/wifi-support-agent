import type { AnswerValue, UserIntent } from "@/lib/conversation/intent";
import {
  connectivityScope,
  conversationState,
  deviceImpact,
  rebootStepStates
} from "@/lib/conversation/constants";
import type {
  ConversationSession,
  ConversationState
} from "@/lib/conversation/state";
import { hasAny, normalizeInput } from "@/lib/conversation/textMatching";

export type FallbackClassifyUserIntentInput = {
  userInput: string;
  session: ConversationSession;
};

export function fallbackClassifyUserIntent({
  userInput,
  session
}: FallbackClassifyUserIntentInput): UserIntent {
  const normalized = normalizeInput(userInput);

  if (session.state === conversationState.start) {
    return classifyAtStart(normalized, userInput);
  }

  if (session.state === conversationState.qualifying) {
    return classifyAtQualifying(normalized, userInput, session.currentQuestionId);
  }

  if (session.state === conversationState.rebootIntro) {
    return classifyConfirmation(normalized, userInput);
  }

  if (isRebootStepState(session.state)) {
    return classifyAtRebootStep(normalized, userInput, session.state);
  }

  if (session.state === conversationState.checkResolution) {
    return classifyConfirmation(normalized, userInput);
  }

  return { type: "unknown", text: userInput };
}

// ─── Phase classifiers ────────────────────────────────────────

function classifyAtStart(
  normalized: string,
  userInput: string
): UserIntent {
  if (isGreeting(normalized)) {
    return { type: "greeting", text: userInput };
  }

  if (hasIssueContext(normalized)) {
    return { type: "answer", value: "yes", text: userInput };
  }

  if (isQuestion(userInput, normalized)) {
    return { type: "question", text: userInput };
  }

  return { type: "unknown", text: userInput };
}

function classifyAtQualifying(
  normalized: string,
  userInput: string,
  questionId: string | null
): UserIntent {
  if (isQuestion(userInput, normalized)) {
    return { type: "question", text: userInput };
  }

  const answerValue = getQualifyingAnswerValue(normalized, questionId);

  if (answerValue) {
    return { type: "answer", value: answerValue, text: userInput };
  }

  return { type: "unknown", text: userInput };
}

function classifyAtRebootStep(
  normalized: string,
  userInput: string,
  state: ConversationState
): UserIntent {
  if (isNegatedCompletion(normalized)) {
    return { type: "unknown", text: userInput };
  }

  if (isCompletion(normalized, state)) {
    return { type: "completion", text: userInput };
  }

  if (isQuestion(userInput, normalized)) {
    return { type: "question", text: userInput };
  }

  return { type: "unknown", text: userInput };
}

function classifyConfirmation(
  normalized: string,
  userInput: string
): UserIntent {
  if (isQuestion(userInput, normalized)) {
    return { type: "question", text: userInput };
  }

  const confirmation = getConfirmationValue(normalized);

  if (confirmation) {
    return { type: "answer", value: confirmation, text: userInput };
  }

  return { type: "unknown", text: userInput };
}

// ─── Answer value matchers ────────────────────────────────────

function getQualifyingAnswerValue(
  normalized: string,
  questionId: string | null
): AnswerValue | null {
  if (questionId === "deviceImpact") {
    return getDeviceImpactValue(normalized);
  }

  if (questionId === "connectivityScope") {
    return getConnectivityScopeValue(normalized);
  }

  return getConfirmationValue(normalized);
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
    return deviceImpact.multipleDevices;
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
    return deviceImpact.singleDevice;
  }

  return null;
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
    return connectivityScope.generalConnectivity;
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
    return connectivityScope.specificService;
  }

  return null;
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

// ─── Completion matchers ──────────────────────────────────────

function isNegatedCompletion(normalizedInput: string): boolean {
  return hasAny(normalizedInput, [
    "not done",
    "not done yet",
    "haven't done",
    "havent done",
    "still waiting",
    "not finished",
    "not complete"
  ]);
}

function isCompletion(
  normalizedInput: string,
  state: ConversationState
): boolean {
  if (hasAny(normalizedInput, ["done", "completed", "complete", "finished"])) {
    return true;
  }

  return (
    rebootStepStates.includes(state as (typeof rebootStepStates)[number]) &&
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

// ─── General matchers ─────────────────────────────────────────

function hasIssueContext(normalizedInput: string): boolean {
  return hasAny(normalizedInput, [
    "internet",
    "wifi",
    "wi fi",
    "connect",
    "connection",
    "offline",
    "down",
    "slow",
    "loads",
    "working",
    "broken",
    "signal",
    "network",
    "router",
    "modem"
  ]);
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

function isRebootStepState(state: ConversationState): boolean {
  return rebootStepStates.includes(state as (typeof rebootStepStates)[number]);
}
