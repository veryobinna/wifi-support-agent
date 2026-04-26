import { describe, expect, it, vi } from "vitest";
import { generateAssistantResponse } from "@/lib/llm/client";
import { createInitialConversationSession } from "@/lib/conversation/state";

describe("LLM client", () => {
  it("returns the deterministic draft without calling the network in test mode", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();

    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = fetchMock as unknown as typeof fetch;

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
        source: "fallback"
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }

      globalThis.fetch = originalFetch;
    }
  });
});
