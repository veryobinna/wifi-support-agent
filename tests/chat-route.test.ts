import { describe, expect, it } from "vitest";
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
