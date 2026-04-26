import { describe, expect, it, vi } from "vitest";
import { classifyUserIntent } from "@/lib/llm/intentClassifier";
import { createInitialConversationSession } from "@/lib/conversation/state";

describe("intent classifier", () => {
  it("returns the fallback intent in test mode without calling the network", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();

    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = fetchMock as unknown as typeof fetch;

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

  it("reports no_api_key when the classifier falls back without an api key", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn();

    delete process.env.OPENAI_API_KEY;
    Object.assign(process.env, { NODE_ENV: "development" });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

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
      expect(fetchMock).not.toHaveBeenCalled();
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

      globalThis.fetch = originalFetch;
    }
  });

  it("reports the reason when the llm request falls back after an http error", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFetch = globalThis.fetch;

    process.env.OPENAI_API_KEY = "test-key";
    Object.assign(process.env, { NODE_ENV: "development" });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false
    }) as unknown as typeof fetch;

    try {
      const result = await classifyUserIntent({
        userInput: "hello",
        session: createInitialConversationSession()
      });

      expect(result).toEqual({
        intent: { type: "greeting", text: "hello" },
        source: "fallback",
        reason: "http_error"
      });
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

      globalThis.fetch = originalFetch;
    }
  });
});
