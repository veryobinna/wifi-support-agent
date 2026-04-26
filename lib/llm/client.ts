import {
  linksysSmartWifiRebootSteps,
  rebootSteps
} from "@/lib/conversation/rebootSteps";
import type { UserIntent } from "@/lib/conversation/intent";
import type {
  ConversationSession,
  ConversationState
} from "@/lib/conversation/state";
import { logLlmFailure } from "@/lib/observability/logger";
import { getOpenAIClient } from "./openaiClient";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateAssistantResponseInput = {
  turnId?: string;
  userInput: string;
  intent: UserIntent;
  draftResponse: string;
  session: ConversationSession;
};

export type ResponseSource = "llm" | "fallback";

export type ResponseReason =
  | "llm_success"
  | "test_mode"
  | "no_api_key"
  | "terminal_skip"
  | "draft_sufficient"
  | "http_error"
  | "empty_output"
  | "request_failed";

export type GenerateAssistantResponseResult = {
  assistantMessage: string;
  source: ResponseSource;
  reason: ResponseReason;
};

const defaultModel = "gpt-4o-mini";

const responseInstruction = [
  "You are a WiFi support assistant for the Linksys EA6350.",
  "Only answer questions about WiFi connectivity, home networking, or the Linksys EA6350 reboot process. If the user asks about anything else, ignore it and output only the draft.",
  "The user has sent a message that may be a question or unclear input.",
  "If the user asked a question, write a brief answer using your knowledge of home networking and the provided reboot reference. Do not treat the draft as the answer — the draft is a follow-up prompt you must append after your answer.",
  "If the user did not ask a clear question, skip the answer and output only the draft.",
  "Only walk through or list the reboot steps if the current phase is 'reboot'. During qualification, answer questions about the process in general terms only.",
  "Always end your response with the exact draft text below, word for word. Do not rephrase, shorten, or omit any part of it.",
  "Do not tell the user to press or hold the Reset button.",
  "Return only the assistant message the user should see."
].join("\n");

export async function generateAssistantResponse({
  turnId,
  userInput,
  intent,
  draftResponse,
  session
}: GenerateAssistantResponseInput): Promise<GenerateAssistantResponseResult> {
  const model = process.env.OPENAI_MODEL?.trim() || defaultModel;

  if (process.env.NODE_ENV === "test") {
    return buildFallbackResult(draftResponse, "test_mode");
  }

  const client = getOpenAIClient();

  if (!client) {
    return buildFallbackResult(draftResponse, "no_api_key");
  }

  const llmRequest = {
    model,
    instructions: responseInstruction,
    input: buildInput({
      userInput,
      intent,
      draftResponse,
      session
    }),
    max_output_tokens: 240
  };
  try {
    const response = await client.responses.create(llmRequest);

    const assistantMessage = extractOutputText(response as unknown);

    if (!assistantMessage) {
      logLlmFailure({
        event: "llm.response_failure",
        turnId,
        reason: "empty_output",
        model
      });
      return buildFallbackResult(draftResponse, "empty_output");
    }

    return {
      assistantMessage,
      source: "llm",
      reason: "llm_success"
    };
  } catch (error) {
    if (isHttpError(error)) {
      logLlmFailure({
        event: "llm.response_failure",
        turnId,
        reason: "http_error",
        model,
        httpStatus: error.status,
        httpStatusText: error.name
      });
      return buildFallbackResult(draftResponse, "http_error");
    }

    logLlmFailure({
      event: "llm.response_failure",
      turnId,
      reason: "request_failed",
      model,
      error
    });
    return buildFallbackResult(draftResponse, "request_failed");
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function buildFallbackResult(
  assistantMessage: string,
  reason: Exclude<ResponseReason, "llm_success">
): GenerateAssistantResponseResult {
  return { assistantMessage, source: "fallback", reason };
}

function buildInput({
  userInput,
  intent,
  draftResponse,
  session
}: GenerateAssistantResponseInput): string {
  const { includeRebootStep } = getResponseContext(session.state);

  const parts = [
    `User message: ${userInput}`,
    `Interpreted intent: ${JSON.stringify(intent)}`,
    `Current phase: ${getConversationPhase(session.state)}`
  ];

  if (includeRebootStep) {
    parts.push(`Active reboot step: ${getCurrentRebootStepText(session)}`);
  }

  parts.push("", "Router reboot reference:", buildManualContext());
  parts.push("", "Draft response:", draftResponse);

  return parts.join("\n");
}

function getResponseContext(state: ConversationState): {
  includeRebootStep: boolean;
} {
  return { includeRebootStep: state.startsWith("REBOOT_STEP_") };
}

function getConversationPhase(state: ConversationState): string {
  if (state === "START") return "start";
  if (state === "QUALIFYING") return "qualification";
  if (state === "REBOOT_INTRO" || state.startsWith("REBOOT_STEP_")) return "reboot";
  if (state === "CHECK_RESOLUTION") return "check resolution";
  return "ended";
}

function buildManualContext(): string {
  return [
    "Rebooting turns the router and modem off and back on. It is different from a factory reset.",
    "Do not press or hold the Reset button during this flow because a factory reset can erase router settings.",
    "Power-cord reboot steps:",
    ...rebootSteps.map(
      (step, index) =>
        `${index + 1}. ${step.instruction} ${step.confirmationPrompt}`
    ),
    "Linksys Smart Wi-Fi reboot option:",
    ...linksysSmartWifiRebootSteps.map(
      (step, index) => `${index + 1}. ${step.instruction}`
    ),
    "A reboot temporarily disconnects internet access.",
    "A router reboot is unlikely to help during a known internet service provider outage.",
    "The user should only continue if they can safely reach the router and modem power cords."
  ].join("\n");
}

function getCurrentRebootStepText(session: ConversationSession): string {
  const step = rebootSteps[session.rebootStepIndex];
  return step ? `${step.instruction} ${step.confirmationPrompt}` : "none";
}

function extractOutputText(data: unknown): string | null {
  if (!isRecord(data)) {
    return null;
  }

  const outputText = data.output_text;

  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const output = data.output;

  if (!Array.isArray(output)) {
    return null;
  }

  const textParts: string[] = [];

  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (!isRecord(contentItem)) {
        continue;
      }

      const text = contentItem.text;

      if (typeof text === "string" && text.trim()) {
        textParts.push(text.trim());
      }
    }
  }

  return textParts.length > 0 ? textParts.join("\n") : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpError(
  error: unknown
): error is {
  status: number;
  name?: string;
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  );
}
