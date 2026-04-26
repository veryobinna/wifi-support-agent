import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAssistantResponse } from "@/lib/llm/client";
import { createInitialConversationSession } from "@/lib/conversation/state";
import { getOpenAIClient } from "@/lib/llm/openaiClient";

vi.mock("@/lib/llm/openaiClient", () => ({
  getOpenAIClient: vi.fn()
}));

describe("LLM client", () => {
  const getOpenAIClientMock = vi.mocked(getOpenAIClient);

  beforeEach(() => {
    getOpenAIClientMock.mockReset();
  });

  it("returns the deterministic draft without calling the network in test mode", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;

    process.env.OPENAI_API_KEY = "test-key";

    try {
      const response = await generateAssistantResponse({
        userInput: "Should I press reset?",
        intent: {
          type: "question",
          text: "Should I press reset?"
        },
        draftResponse: "Do not press the Reset button.",
        session: createInitialConversationSession()
      });

      expect(response).toEqual({
        assistantMessage: "Do not press the Reset button.",
        source: "fallback",
        reason: "test_mode"
      });
      expect(getOpenAIClientMock).not.toHaveBeenCalled();
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    }
  });
});
