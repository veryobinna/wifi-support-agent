export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function generateAssistantResponse(): Promise<string> {
  throw new Error("LLM client has not been implemented yet.");
}
