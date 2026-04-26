import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";
import {
  createInitialConversationSession,
  type ChatRequest,
  type ChatResponse
} from "@/lib/conversation/state";

describe("/api/chat", () => {
  it("advances the conversation with a valid user message", async () => {
    const response = await POST(
      createJsonRequest({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: "My WiFi is down."
          }
        ]
      })
    );

    const body = (await response.json()) as ChatResponse;

    expect(response.status).toBe(200);
    expect(body.state).toBe("QUALIFYING");
    expect(body.session?.currentQuestionId).toBe("deviceImpact");
    expect(body.message.content).toContain("one device or multiple devices");
  });

  it("does not fabricate a problem from a greeting", async () => {
    const response = await POST(
      createJsonRequest({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: "hello"
          }
        ]
      })
    );

    const body = (await response.json()) as ChatResponse;

    expect(response.status).toBe(200);
    expect(body.state).toBe("START");
    expect(body.session?.currentQuestionId).toBeNull();
    expect(body.message.content).toContain("What WiFi or internet issue");
  });

  it("continues from the supplied conversation session", async () => {
    const session = {
      ...createInitialConversationSession(),
      state: "QUALIFYING" as const,
      currentQuestionId: "deviceImpact" as const
    };

    const response = await POST(
      createJsonRequest({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: "multiple devices"
          }
        ],
        session
      })
    );

    const body = (await response.json()) as ChatResponse;

    expect(response.status).toBe(200);
    expect(body.session?.qualification.deviceImpact).toBe("multiple_devices");
    expect(body.session?.currentQuestionId).toBe("connectivityScope");
  });

  it("skips the response LLM when the engine transitions into a terminal state", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          type: "answer",
          value: "specific_service",
          text: "only one app"
        })
      })
    });
    const session = {
      ...createInitialConversationSession(),
      state: "QUALIFYING" as const,
      currentQuestionId: "connectivityScope" as const
    };

    Object.assign(process.env, {
      OPENAI_API_KEY: "test-key",
      NODE_ENV: "development"
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const response = await POST(
        createJsonRequest({
          messages: [{ id: "user-1", role: "user", content: "one app" }],
          session
        })
      );

      const body = (await response.json()) as ChatResponse;

      expect(response.status).toBe(200);
      expect(body.state).toBe("NOT_APPROPRIATE_EXIT");
      expect(body.message.content).toContain("not the right first step");
      expect(body.message.content).not.toContain(
        "Would you like to start the reboot process?"
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      if (originalApiKey === undefined) {
        Reflect.deleteProperty(process.env, "OPENAI_API_KEY");
      } else {
        Object.assign(process.env, { OPENAI_API_KEY: originalApiKey });
      }

      if (originalNodeEnv === undefined) {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      } else {
        Object.assign(process.env, { NODE_ENV: originalNodeEnv });
      }

      globalThis.fetch = originalFetch;
    }
  });

  it("does not call the LLM and returns a session-ended message for NOT_APPROPRIATE_EXIT", async () => {
    const session = {
      ...createInitialConversationSession(),
      state: "NOT_APPROPRIATE_EXIT" as const
    };

    const response = await POST(
      createJsonRequest({
        messages: [{ id: "user-1", role: "user", content: "what next steps?" }],
        session
      })
    );

    const body = (await response.json()) as ChatResponse;

    expect(response.status).toBe(200);
    expect(body.state).toBe("NOT_APPROPRIATE_EXIT");
    expect(body.message.content).toContain("session has ended");
  });

  it("does not call the LLM and returns a session-ended message for RESOLVED_EXIT", async () => {
    const session = {
      ...createInitialConversationSession(),
      state: "RESOLVED_EXIT" as const
    };

    const response = await POST(
      createJsonRequest({
        messages: [{ id: "user-1", role: "user", content: "thanks" }],
        session
      })
    );

    const body = (await response.json()) as ChatResponse;

    expect(response.status).toBe(200);
    expect(body.state).toBe("RESOLVED_EXIT");
    expect(body.message.content).toContain("session has ended");
  });

  it("does not call the LLM and returns a session-ended message for UNRESOLVED_EXIT", async () => {
    const session = {
      ...createInitialConversationSession(),
      state: "UNRESOLVED_EXIT" as const
    };

    const response = await POST(
      createJsonRequest({
        messages: [{ id: "user-1", role: "user", content: "ok" }],
        session
      })
    );

    const body = (await response.json()) as ChatResponse;

    expect(response.status).toBe(200);
    expect(body.state).toBe("UNRESOLVED_EXIT");
    expect(body.message.content).toContain("session has ended");
  });

  it("rejects requests without a latest user message", async () => {
    const response = await POST(
      createJsonRequest({
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: "How can I help?"
          }
        ]
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid session data", async () => {
    const response = await POST(
      createRawJsonRequest({
        messages: [
          {
            id: "user-1",
            role: "user",
            content: "multiple devices"
          }
        ],
        session: {
          ...createInitialConversationSession(),
          currentQuestionId: "unknown-question"
        }
      })
    );

    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: "{"
      })
    );

    expect(response.status).toBe(400);
  });
});

function createJsonRequest(body: ChatRequest): Request {
  return createRawJsonRequest(body);
}

function createRawJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
