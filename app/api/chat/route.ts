import { NextResponse } from "next/server";
import { chatRole } from "@/lib/conversation/constants";
import {
  advanceConversation,
  isTerminalState
} from "@/lib/conversation/engine";
import { generateAssistantResponse } from "@/lib/llm/client";
import { classifyUserIntent } from "@/lib/llm/intentClassifier";
import {
  logChatRequestFailed,
  logConversationTurn,
  logInvalidChatRequest
} from "@/lib/observability/logger";
import { chatRequestSchema } from "./schema";
import {
  createInitialConversationSession,
  type ChatRequest,
  type ChatMessage,
  type ChatResponse
} from "@/lib/conversation/state";

export async function POST(request: Request) {
  const turnId = crypto.randomUUID();
  const debugEnabled = isReviewerDebugEnabled(request);
  const requestStartedAt = performance.now();
  try {
    const parsedRequest = await parseChatRequest(request);

    if (!parsedRequest.ok) {
      logInvalidChatRequest({
        turnId,
        reason: parsedRequest.reason,
        message: parsedRequest.error,
        ...(parsedRequest.details ? { details: parsedRequest.details } : {})
      });

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
    const previousState = session.state;
    const previousQuestionId = session.currentQuestionId;

    if (isTerminalState(session.state)) {
      const engineStartedAt = performance.now();
      const turn = advanceConversation(session, { type: "unknown" });
      const engineLatencyMs = getLatencyMs(engineStartedAt);
      const totalLatencyMs = getLatencyMs(requestStartedAt);

      logConversationTurn({
        turnId,
        userInput: latestUserMessage.content,
        intent: { type: "unknown" },
        previousState,
        nextState: turn.session.state,
        previousQuestionId,
        nextQuestionId: turn.session.currentQuestionId,
        draftResponse: turn.assistantMessage,
        assistantMessage: turn.assistantMessage,
        classifierSource: "fallback",
        classifierReason: "terminal_skip",
        responseSource: "fallback",
        responseReason: "terminal_skip"
      });

      return NextResponse.json({
        message: {
          id: crypto.randomUUID(),
          role: chatRole.assistant,
          content: turn.assistantMessage
        },
        state: turn.session.state,
        session: turn.session,
        ...(debugEnabled
          ? {
              debug: {
                turnId,
                latencyMs: {
                  total: totalLatencyMs,
                  classifier: 0,
                  engine: engineLatencyMs,
                  response: 0
                },
                previousState,
                nextState: turn.session.state,
                previousQuestionId,
                nextQuestionId: turn.session.currentQuestionId,
                intent: JSON.stringify({ type: "unknown" }),
                classifierSource: "fallback" as const,
                classifierReason: "terminal_skip" as const,
                responseSource: "fallback" as const,
                responseReason: "terminal_skip" as const,
                draftResponse: turn.assistantMessage,
                assistantMessage: turn.assistantMessage
              }
            }
          : {})
      } satisfies ChatResponse);
    }

    const classifierStartedAt = performance.now();
    const classifiedIntent = await classifyUserIntent({
      turnId,
      userInput: latestUserMessage.content,
      session
    });
    const classifierLatencyMs = getLatencyMs(classifierStartedAt);

    const engineStartedAt = performance.now();
    const turn = advanceConversation(session, classifiedIntent.intent);
    const engineLatencyMs = getLatencyMs(engineStartedAt);
    const responseStartedAt = performance.now();
    const assistantResponse = isTerminalState(turn.session.state)
      ? {
          assistantMessage: turn.assistantMessage,
          source: "fallback" as const,
          reason: "terminal_skip" as const
        }
      : await generateAssistantResponse({
          turnId,
          userInput: latestUserMessage.content,
          intent: classifiedIntent.intent,
          draftResponse: turn.assistantMessage,
          session: turn.session
        });
    const responseLatencyMs = getLatencyMs(responseStartedAt);
    const totalLatencyMs = getLatencyMs(requestStartedAt);

    logConversationTurn({
      turnId,
      userInput: latestUserMessage.content,
      intent: classifiedIntent.intent,
      previousState,
      nextState: turn.session.state,
      previousQuestionId,
      nextQuestionId: turn.session.currentQuestionId,
      draftResponse: turn.assistantMessage,
      assistantMessage: assistantResponse.assistantMessage,
      classifierSource: classifiedIntent.source,
      classifierReason: classifiedIntent.reason,
      responseSource: assistantResponse.source,
      responseReason: assistantResponse.reason
    });

    const response: ChatResponse = {
      message: {
        id: crypto.randomUUID(),
        role: chatRole.assistant,
        content: assistantResponse.assistantMessage
      },
      state: turn.session.state,
      session: turn.session,
      ...(debugEnabled
        ? {
            debug: {
              turnId,
              latencyMs: {
                total: totalLatencyMs,
                classifier: classifierLatencyMs,
                engine: engineLatencyMs,
                response: responseLatencyMs
              },
              previousState,
              nextState: turn.session.state,
              previousQuestionId,
              nextQuestionId: turn.session.currentQuestionId,
              intent: JSON.stringify(classifiedIntent.intent),
              classifierSource: classifiedIntent.source,
              classifierReason: classifiedIntent.reason,
              responseSource: assistantResponse.source,
              responseReason: assistantResponse.reason,
              draftResponse: turn.assistantMessage,
              assistantMessage: assistantResponse.assistantMessage
            }
          }
        : {})
    };

    return NextResponse.json(response);
  } catch (error) {
    logChatRequestFailed({
      turnId,
      message: "Unexpected failure while handling /api/chat.",
      error
    });

    return NextResponse.json(
      {
        error: "The chat request could not be completed."
      },
      {
        status: 500
      }
    );
  }
}

function isReviewerDebugEnabled(request: Request): boolean {
  return new URL(request.url).searchParams.get("review") === "1";
}

function getLatencyMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(1));
}

type ParsedChatRequest =
  | {
      ok: true;
      latestUserMessage: ChatMessage;
      session: NonNullable<ChatRequest["session"]>;
    }
  | {
      ok: false;
      reason:
        | "invalid_json"
        | "schema_invalid"
        | "latest_message_not_user"
        | "latest_message_empty";
      error: string;
      details?: string;
    };

async function parseChatRequest(request: Request): Promise<ParsedChatRequest> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      reason: "invalid_json",
      error: "Request body must be valid JSON."
    };
  }

  const parsedBody = chatRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return {
      ok: false,
      reason: "schema_invalid",
      error: parsedBody.error.issues[0]?.message ?? "Request is invalid.",
      details: parsedBody.error.issues[0]?.path.join(".") ?? undefined
    };
  }

  const { messages } = parsedBody.data;
  const latestMessage = messages.at(-1);

  if (!latestMessage || latestMessage.role !== chatRole.user) {
    return {
      ok: false,
      reason: "latest_message_not_user",
      error: "The latest chat message must be from the user."
    };
  }

  if (!latestMessage.content.trim()) {
    return {
      ok: false,
      reason: "latest_message_empty",
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
