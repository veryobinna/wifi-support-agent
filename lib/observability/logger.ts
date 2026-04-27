import type { UserIntent } from "@/lib/conversation/intent";
import type { ConversationState } from "@/lib/conversation/state";

type ClassifierSource = "llm" | "fallback";
type ClassifierReason =
  | "llm_success"
  | "test_mode"
  | "no_api_key"
  | "terminal_skip"
  | "http_error"
  | "empty_output"
  | "parse_failed"
  | "schema_invalid"
  | "request_failed";

type ResponseSource = "llm" | "fallback";
type ResponseReason =
  | "llm_success"
  | "test_mode"
  | "no_api_key"
  | "terminal_skip"
  | "draft_sufficient"
  | "http_error"
  | "empty_output"
  | "request_failed";

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
  const payload: Record<string, unknown> = {
    event: "conversation.turn",
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

  emitLog(payload, "log");
}

export type InvalidChatRequestLogEvent = {
  turnId: string;
  reason:
    | "invalid_json"
    | "schema_invalid"
    | "latest_message_not_user"
    | "latest_message_empty";
  message: string;
  details?: string;
};

export function logInvalidChatRequest(event: InvalidChatRequestLogEvent): void {
  emitLog(
    {
      event: "chat.request_invalid",
      turnId: event.turnId,
      reason: event.reason,
      message: event.message,
      ...(event.details ? { details: event.details } : {})
    },
    "warn"
  );
}

export type ChatRequestFailedLogEvent = {
  turnId: string;
  message: string;
  error: unknown;
};

export function logChatRequestFailed(
  event: ChatRequestFailedLogEvent
): void {
  emitLog(
    {
      event: "chat.request_failed",
      turnId: event.turnId,
      message: event.message,
      error: getErrorMessage(event.error)
    },
    "error"
  );
}

export type LlmFailureLogEvent = {
  event: "llm.classifier_failure" | "llm.response_failure";
  turnId?: string;
  reason:
    | "http_error"
    | "empty_output"
    | "parse_failed"
    | "schema_invalid"
    | "request_failed";
  model: string;
  httpStatus?: number;
  httpStatusText?: string;
  error?: unknown;
};

export function logLlmFailure(event: LlmFailureLogEvent): void {
  emitLog(
    {
      event: event.event,
      ...(event.turnId ? { turnId: event.turnId } : {}),
      reason: event.reason,
      model: event.model,
      ...(event.httpStatus !== undefined ? { httpStatus: event.httpStatus } : {}),
      ...(event.httpStatusText ? { httpStatusText: event.httpStatusText } : {}),
      ...(event.error !== undefined
        ? { error: getErrorMessage(event.error) }
        : {})
    },
    "warn"
  );
}

function emitLog(
  payload: Record<string, unknown>,
  method: "log" | "warn" | "error"
): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const message = JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString()
  });

  console[method](message);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}
