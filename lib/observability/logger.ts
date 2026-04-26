import type { UserIntent } from "@/lib/conversation/intent";
import type { ConversationState } from "@/lib/conversation/state";
import type { ClassifierReason, ClassifierSource } from "@/lib/llm/intentClassifier";
import type { ResponseReason, ResponseSource } from "@/lib/llm/client";

export type ConversationTurnLogEvent = {
  turnId: string;
  userInput: string;
  intent: UserIntent;
  previousState: ConversationState;
  nextState: ConversationState;
  previousQuestionId: string | null;
  nextQuestionId: string | null;
  draftResponse: string;
  assistantMessage: string;
  classifierSource: ClassifierSource;
  classifierReason: ClassifierReason;
  responseSource: ResponseSource;
  responseReason: ResponseReason;
};

export function logConversationTurn(event: ConversationTurnLogEvent): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const payload: Record<string, unknown> = {
    event: "conversation.turn",
    timestamp: new Date().toISOString(),
    turnId: event.turnId,
    intent: event.intent,
    previousState: event.previousState,
    nextState: event.nextState,
    previousQuestionId: event.previousQuestionId,
    nextQuestionId: event.nextQuestionId,
    draftResponse: event.draftResponse,
    classifierSource: event.classifierSource,
    classifierReason: event.classifierReason,
    responseSource: event.responseSource,
    responseReason: event.responseReason
  };

  if (process.env.LOG_USER_TEXT === "true") {
    payload.userInput = event.userInput;
  }

  if (process.env.LOG_ASSISTANT_TEXT === "true") {
    payload.assistantMessage = event.assistantMessage;
  }

  console.log(JSON.stringify(payload));
}
