import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyUserIntent } from "@/lib/llm/intentClassifier";
import { createInitialConversationSession } from "@/lib/conversation/state";
import { getOpenAIClient } from "@/lib/llm/openaiClient";

vi.mock("@/lib/llm/openaiClient", () => ({
  getOpenAIClient: vi.fn()
}));

describe("intent classifier", () => {
  const getOpenAIClientMock = vi.mocked(getOpenAIClient);

  beforeEach(() => {
    getOpenAIClientMock.mockReset();
  });

  it("returns the fallback intent in test mode without calling the network", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;

    process.env.OPENAI_API_KEY = "test-key";

    try {
      const result = await classifyUserIntent({
        userInput: "hello",
        session: createInitialConversationSession()
      });

      expect(result).toEqual({
        intent: { type: "greeting", text: "hello" },
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

  it("reports no_api_key when the classifier falls back without an api key", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalNodeEnv = process.env.NODE_ENV;

    delete process.env.OPENAI_API_KEY;
    Object.assign(process.env, { NODE_ENV: "development" });
    getOpenAIClientMock.mockReturnValue(null);

    try {
      const result = await classifyUserIntent({
        userInput: "hello",
        session: createInitialConversationSession()
      });

      expect(result).toEqual({
        intent: { type: "greeting", text: "hello" },
        source: "fallback",
        reason: "no_api_key"
      });
      expect(getOpenAIClientMock).toHaveBeenCalledTimes(1);
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

  it("reports the reason when the llm request falls back after an http error", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalNodeEnv = process.env.NODE_ENV;
    const createMock = vi.fn().mockRejectedValue({
      status: 500,
      name: "InternalServerError"
    });

    process.env.OPENAI_API_KEY = "test-key";
    Object.assign(process.env, { NODE_ENV: "development" });
    getOpenAIClientMock.mockReturnValue({
      responses: {
        create: createMock
      }
    } as never);

    try {
      const result = await classifyUserIntent({
        userInput: "hello",
        session: createInitialConversationSession()
      });

      expect(result).toEqual(
        expect.objectContaining({
          intent: { type: "greeting", text: "hello" },
          source: "fallback",
          reason: "http_error"
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
