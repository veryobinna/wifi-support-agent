export const conversationStates = [
  "START",
  "QUALIFYING",
  "NOT_APPROPRIATE_EXIT",
  "REBOOT_INTRO",
  "REBOOT_STEP_1",
  "REBOOT_STEP_2",
  "REBOOT_STEP_3",
  "REBOOT_STEP_4",
  "CHECK_RESOLUTION",
  "RESOLVED_EXIT",
  "UNRESOLVED_EXIT"
] as const;

export type ConversationState = (typeof conversationStates)[number];

export const initialConversationState: ConversationState = "START";

export type ChatRole = "assistant" | "user";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  state?: ConversationState;
};

export type ChatResponse = {
  message: ChatMessage;
  state: ConversationState;
};
