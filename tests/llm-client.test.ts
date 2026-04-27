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

  it("passes qualification question context and xml draft wrapper to the response llm", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalNodeEnv = process.env.NODE_ENV;
    const createMock = vi.fn().mockResolvedValue({
      output_text:
        "This helps determine whether the issue is general or limited to one service.\n\nIs this a general WiFi or internet problem, or is it only one app or website?"
    });

    Object.assign(process.env, {
      OPENAI_API_KEY: "test-key",
      NODE_ENV: "development"
    });
    getOpenAIClientMock.mockReturnValue({
      responses: {
        create: createMock
      }
    } as never);

    try {
      await generateAssistantResponse({
        userInput: "Why is that important?",
        intent: {
          type: "question",
          text: "Why is that important?"
        },
        draftResponse:
          "Is this a general WiFi or internet problem, or is it only one app or website?",
        session: {
          ...createInitialConversationSession(),
          state: "QUALIFYING",
          currentQuestionId: "connectivityScope"
        }
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          instructions: expect.stringContaining(
            "Do not include XML tags"
          ),
          input: expect.stringContaining(
            "Current qualification question: Is this a general WiFi or internet problem, or is it only one app or website?"
          )
        })
      );
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.stringContaining(
            "<draft_response>\nIs this a general WiFi or internet problem, or is it only one app or website?\n</draft_response>"
          )
        })
      );
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }

      if (originalNodeEnv === undefined) {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      } else {
        Object.assign(process.env, { NODE_ENV: originalNodeEnv });
      }
    }
  });
});
