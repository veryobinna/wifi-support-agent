import type {
  QualificationAnswers,
  QualificationQuestionId
} from "./qualification";

export const rebootStepStates = [
  "REBOOT_STEP_1",
  "REBOOT_STEP_2",
  "REBOOT_STEP_3",
  "REBOOT_STEP_4",
  "REBOOT_STEP_5",
  "REBOOT_STEP_6"
] as const;

export const conversationStates = [
  "START",
  "QUALIFYING",
  "NOT_APPROPRIATE_EXIT",
  "REBOOT_INTRO",
  ...rebootStepStates,
  "CHECK_RESOLUTION",
  "RESOLVED_EXIT",
  "UNRESOLVED_EXIT"
] as const;

export type ConversationState = (typeof conversationStates)[number];

export const initialConversationState: ConversationState = "START";

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

export type ChatRole = "assistant" | "user";

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
