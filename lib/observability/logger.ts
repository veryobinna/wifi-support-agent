import type { UserIntent } from "@/lib/conversation/intent";
import type { ConversationState } from "@/lib/conversation/state";

export type ConversationTurnLogEvent = {
  turnId: string;
  userInput: string;
  intent: UserIntent;
  previousState: ConversationState;
  nextState: ConversationState;
  previousQuestionId: string | null;
  nextQuestionId: string | null;
  draftResponse: string;
  classifierSource: "llm" | "fallback";
  responseSource: "llm" | "fallback";
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
    responseSource: event.responseSource
  };

  if (process.env.LOG_USER_TEXT === "true") {
    payload.userInput = event.userInput;
  }

  console.log(JSON.stringify(payload));
}
