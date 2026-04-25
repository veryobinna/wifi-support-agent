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
};
