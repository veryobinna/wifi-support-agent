import type {
  QualificationAnswers,
  QualificationQuestionId
} from "./qualification";
import {
  chatRoles,
  conversationState,
  conversationStates,
  rebootStepStates
} from "./constants";

export { conversationStates, rebootStepStates };

export type ConversationState = (typeof conversationStates)[number];

export const initialConversationState: ConversationState =
  conversationState.start;

export type ConversationSession = {
  state: ConversationState;
  qualification: QualificationAnswers;
  currentQuestionId: QualificationQuestionId | null;
  rebootStepIndex: number;
};

export function createInitialConversationSession(): ConversationSession {
  return {
    state: initialConversationState,
    qualification: {},
    currentQuestionId: null,
    rebootStepIndex: 0
  };
}

export type ChatRole = (typeof chatRoles)[number];

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  state?: ConversationState;
  session?: ConversationSession;
};

export type ChatResponse = {
  message: ChatMessage;
  state: ConversationState;
  session?: ConversationSession;
  debug?: ChatDebugInfo;
};

export type ChatDebugInfo = {
  turnId: string;
  latencyMs: {
    total: number;
    classifier: number;
    engine: number;
    response: number;
  };
  previousState: ConversationState;
  nextState: ConversationState;
  previousQuestionId: QualificationQuestionId | null;
  nextQuestionId: QualificationQuestionId | null;
  intent: string;
  classifierSource: "llm" | "fallback";
  classifierReason:
    | "llm_success"
    | "test_mode"
    | "no_api_key"
    | "terminal_skip"
    | "http_error"
    | "empty_output"
    | "parse_failed"
    | "schema_invalid"
    | "request_failed";
  responseSource: "llm" | "fallback";
  responseReason:
    | "llm_success"
    | "test_mode"
    | "no_api_key"
    | "terminal_skip"
    | "draft_sufficient"
    | "http_error"
    | "empty_output"
    | "request_failed";
  draftResponse: string;
  assistantMessage: string;
};
