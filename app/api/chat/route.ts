import { NextResponse } from "next/server";
import { chatRole } from "@/lib/conversation/constants";
import { advanceConversation } from "@/lib/conversation/engine";
import { generateAssistantResponse } from "@/lib/llm/client";
import { chatRequestSchema } from "./schema";
import {
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
  const assistantMessage = await generateAssistantResponse({
    userInput: latestUserMessage.content,
    draftResponse: turn.assistantMessage,
    session: turn.session
  });

  const response: ChatResponse = {
    message: {
      id: crypto.randomUUID(),
      role: chatRole.assistant,
      content: assistantMessage
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

  const parsedBody = chatRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return {
      ok: false,
      error: parsedBody.error.issues[0]?.message ?? "Request is invalid."
    };
  }

  const { messages } = parsedBody.data;
  const latestMessage = messages.at(-1);

  if (!latestMessage || latestMessage.role !== chatRole.user) {
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

  return {
    ok: true,
    latestUserMessage: latestMessage,
    session: getConversationSession(parsedBody.data)
  };
}

function getConversationSession(
  body: ChatRequest
): NonNullable<ChatRequest["session"]> {
  if (body.session) {
    return body.session;
  }

  const session = createInitialConversationSession();

  if (body.state) {
    return {
      ...session,
      state: body.state
    };
  }

  return session;
}
