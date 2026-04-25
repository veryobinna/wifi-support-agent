import { NextResponse } from "next/server";
import { advanceConversation } from "@/lib/conversation/engine";
import { qualificationQuestionIds } from "@/lib/conversation/qualification";
import {
  conversationStates,
  createInitialConversationSession,
  type ChatRequest,
  type ChatMessage,
  type ChatResponse
} from "@/lib/conversation/state";

export async function POST(request: Request) {
  const parsedRequest = await parseChatRequest(request);

  if (!parsedRequest.ok) {
    return NextResponse.json(
      {
        error: parsedRequest.error
      },
      {
        status: 400
      }
    );
  }

  const { latestUserMessage, session } = parsedRequest;
  const turn = advanceConversation(session, latestUserMessage.content);

  const response: ChatResponse = {
    message: {
      id: crypto.randomUUID(),
      role: "assistant",
      content: turn.assistantMessage
    },
    state: turn.session.state,
    session: turn.session
  };

  return NextResponse.json(response);
}

type ParsedChatRequest =
  | {
      ok: true;
      latestUserMessage: ChatMessage;
      session: NonNullable<ChatRequest["session"]>;
    }
  | {
      ok: false;
      error: string;
    };

async function parseChatRequest(request: Request): Promise<ParsedChatRequest> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      error: "Request body must be valid JSON."
    };
  }

  if (!isRecord(body)) {
    return {
      ok: false,
      error: "Request body must be an object."
    };
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return {
      ok: false,
      error: "Request must include at least one chat message."
    };
  }

  const messages = body.messages;

  if (!messages.every(isChatMessage)) {
    return {
      ok: false,
      error: "Every chat message must include id, role, and content."
    };
  }

  const latestMessage = messages.at(-1);

  if (!latestMessage || latestMessage.role !== "user") {
    return {
      ok: false,
      error: "The latest chat message must be from the user."
    };
  }

  if (!latestMessage.content.trim()) {
    return {
      ok: false,
      error: "The latest user message cannot be empty."
    };
  }

  const session = parseConversationSession(body);

  if (!session.ok) {
    return session;
  }

  return {
    ok: true,
    latestUserMessage: latestMessage,
    session: session.value
  };
}

type ParsedSession =
  | {
      ok: true;
      value: NonNullable<ChatRequest["session"]>;
    }
  | {
      ok: false;
      error: string;
    };

function parseConversationSession(
  body: Record<string, unknown>
): ParsedSession {
  if (body.session === undefined) {
    const session = createInitialConversationSession();

    if (isConversationState(body.state)) {
      return {
        ok: true,
        value: {
          ...session,
          state: body.state
        }
      };
    }

    return {
      ok: true,
      value: session
    };
  }

  if (!isConversationSession(body.session)) {
    return {
      ok: false,
      error: "Session is invalid or incomplete."
    };
  }

  return {
    ok: true,
    value: body.session
  };
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.role === "assistant" || value.role === "user") &&
    typeof value.content === "string"
  );
}

function isConversationSession(
  value: unknown
): value is NonNullable<ChatRequest["session"]> {
  if (!isRecord(value)) {
    return false;
  }

  const rebootStepIndex = value.rebootStepIndex;

  return (
    isConversationState(value.state) &&
    isRecord(value.qualification) &&
    (isQualificationQuestionId(value.currentQuestionId) ||
      value.currentQuestionId === null) &&
    typeof rebootStepIndex === "number" &&
    Number.isInteger(rebootStepIndex) &&
    rebootStepIndex >= 0
  );
}

function isConversationState(value: unknown): value is ChatResponse["state"] {
  return (
    typeof value === "string" &&
    conversationStates.some((state) => state === value)
  );
}

function isQualificationQuestionId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    qualificationQuestionIds.some((questionId) => questionId === value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
