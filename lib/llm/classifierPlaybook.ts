import {
  confirmationAnswer,
  conversationState,
  connectivityScope,
  deviceImpact,
  rebootStepStates
} from "@/lib/conversation/constants";
import type { QualificationQuestionId } from "@/lib/conversation/qualification";
import type { ConversationState } from "@/lib/conversation/state";
import type { AnswerValue, UserIntent } from "@/lib/conversation/intent";

export type IntentType = UserIntent["type"];

export type ClassifierConfig = {
  instructions: string;
  validTypes: IntentType[];
  validValues: AnswerValue[];
};

const startConfig: ClassifierConfig = {
  instructions: [
    "You are a classifier for a WiFi support assistant at the START of a conversation.",
    "Your only job: decide whether the user is reporting a WiFi or internet problem.",
    "Return type 'answer' with value 'yes' if the user describes any internet or WiFi issue — slow speeds, no connection, dropped signal, can't load anything, intermittent drops, etc.",
    "Return type 'answer' with value 'no' if the user explicitly says they have no problem.",
    "Return type 'greeting' for greetings such as hi, hello, hey.",
    "Return type 'question' if the user is asking a question.",
    "Return type 'unknown' for off-topic messages, tests, or anything unclear.",
    "Do not attempt to classify the scope or device impact — that happens in a later phase."
  ].join("\n"),
  validTypes: ["answer", "greeting", "question", "unknown"],
  validValues: [confirmationAnswer.yes, confirmationAnswer.no]
};

const deviceImpactConfig: ClassifierConfig = {
  instructions: [
    "You are a classifier for a WiFi support assistant.",
    "The user was asked: 'Is the problem affecting one device or multiple devices?'",
    "Return type 'answer' with value 'single_device' if only one device is affected.",
    "Return type 'answer' with value 'multiple_devices' if more than one device is affected, or if the whole household is affected.",
    "Return type 'question' if the user is asking a clarification question.",
    "Return type 'unknown' if the answer is unclear or does not address device count."
  ].join("\n"),
  validTypes: ["answer", "question", "unknown"],
  validValues: [deviceImpact.singleDevice, deviceImpact.multipleDevices]
};

const connectivityScopeConfig: ClassifierConfig = {
  instructions: [
    "You are a classifier for a WiFi support assistant.",
    "The user was asked: 'Is this a general WiFi or internet problem, or is it only one app or website?'",
    "Return type 'answer' with value 'general_connectivity' if the problem affects all internet access, all apps, all websites, or general connectivity.",
    "Phrases like 'not just one app', 'everything is slow', 'nothing loads', 'all websites', 'every app' → general_connectivity.",
    "Return type 'answer' with value 'specific_service' if only one specific app, website, or service is affected.",
    "Phrases like 'only Netflix', 'just YouTube', 'one website', 'only one app' → specific_service.",
    "Return type 'question' if the user is asking a clarification question.",
    "Return type 'unknown' if the answer is unclear."
  ].join("\n"),
  validTypes: ["answer", "question", "unknown"],
  validValues: [
    connectivityScope.generalConnectivity,
    connectivityScope.specificService
  ]
};

const yesNoConfig: ClassifierConfig = {
  instructions: [
    "You are a classifier for a WiFi support assistant.",
    "The user was asked a yes/no question.",
    "Return type 'answer' with value 'yes' for affirmative responses: yes, yeah, yep, sure, correct, it is, they are, etc.",
    "Return type 'answer' with value 'no' for negative responses: no, nope, not really, they aren't, it isn't, etc.",
    "Return type 'answer' with value 'unsure' for: not sure, don't know, maybe, possibly, not certain.",
    "Return type 'question' if the user is asking a clarification question.",
    "Return type 'unknown' if the answer is genuinely unclear.",
    "Important: 'not done', 'not yet', 'haven't done it', 'still waiting' → type 'unknown', never 'answer'."
  ].join("\n"),
  validTypes: ["answer", "question", "unknown"],
  validValues: [
    confirmationAnswer.yes,
    confirmationAnswer.no,
    confirmationAnswer.unsure
  ]
};

const rebootIntroConfig: ClassifierConfig = {
  instructions: [
    "You are a classifier for a WiFi support assistant.",
    "The user was asked if they are ready to begin the physical router reboot steps.",
    "Return type 'answer' with value 'yes' if they confirm they are ready: yes, ready, go ahead, let's do it, ok, sure.",
    "Return type 'answer' with value 'no' if they are not ready or want to stop.",
    "Return type 'question' if they are asking a question about the reboot process.",
    "Return type 'unknown' for unclear responses."
  ].join("\n"),
  validTypes: ["answer", "question", "unknown"],
  validValues: [confirmationAnswer.yes, confirmationAnswer.no]
};

const rebootStepConfig: ClassifierConfig = {
  instructions: [
    "You are a classifier for a WiFi support assistant.",
    "The user is working through a physical router reboot step.",
    "Return type 'completion' if the user indicates they have finished the current step: done, finished, complete, ok, it's done, reconnected, unplugged, waited, etc.",
    "Never return completion if the message contains negation or expresses incompleteness: 'not done', 'not done yet', 'haven't done it', 'still waiting', 'not finished' → type 'unknown'.",
    "Return type 'question' if the user is asking for clarification about the current step.",
    "Return type 'unknown' for anything unclear or off-topic."
  ].join("\n"),
  validTypes: ["completion", "question", "unknown"],
  validValues: []
};

const checkResolutionConfig: ClassifierConfig = {
  instructions: [
    "You are a classifier for a WiFi support assistant.",
    "The user was asked whether their WiFi or internet issue is now resolved after the reboot.",
    "Return type 'answer' with value 'yes' if the issue is resolved.",
    "Return type 'answer' with value 'no' if the issue is not resolved.",
    "Return type 'question' if the user is asking a follow-up question.",
    "Return type 'unknown' for unclear responses."
  ].join("\n"),
  validTypes: ["answer", "question", "unknown"],
  validValues: [confirmationAnswer.yes, confirmationAnswer.no]
};

const terminalConfig: ClassifierConfig = {
  instructions: "The conversation has ended. Return type 'unknown', value null, text null.",
  validTypes: ["unknown"],
  validValues: []
};


const yesNoQuestionIds: QualificationQuestionId[] = [
  "equipmentStatus",
  "knownOutage",
  "canAccessEquipment",
  "acceptsTemporaryInterruption"
];


export function getClassifierConfig(
  state: ConversationState,
  questionId: QualificationQuestionId | null
): ClassifierConfig {
  if (state === conversationState.start) return startConfig;

  if (state === conversationState.qualifying) {
    if (questionId === "deviceImpact") return deviceImpactConfig;
    if (questionId === "connectivityScope") return connectivityScopeConfig;
    if (questionId !== null && yesNoQuestionIds.includes(questionId)) {
      return yesNoConfig;
    }
    return yesNoConfig;
  }

  if (state === conversationState.rebootIntro) return rebootIntroConfig;
  if (rebootStepStates.includes(state as (typeof rebootStepStates)[number])) {
    return rebootStepConfig;
  }
  if (state === conversationState.checkResolution) {
    return checkResolutionConfig;
  }

  return terminalConfig;
}
