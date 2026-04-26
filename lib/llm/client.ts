import {
  linksysSmartWifiRebootSteps,
  rebootSteps
} from "@/lib/conversation/rebootSteps";
import { systemPrompt } from "@/lib/conversation/systemPrompt";
import type { UserIntent } from "@/lib/conversation/intent";
import type { ConversationSession } from "@/lib/conversation/state";

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateAssistantResponseInput = {
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
  | "http_error"
  | "empty_output"
  | "request_failed";

export type GenerateAssistantResponseResult = {
  assistantMessage: string;
  source: ResponseSource;
  reason: ResponseReason;
};

const openaiResponsesUrl = "https://api.openai.com/v1/responses";
const defaultModel = "gpt-4o-mini";

export async function generateAssistantResponse({
  userInput,
  intent,
  draftResponse,
  session
}: GenerateAssistantResponseInput): Promise<GenerateAssistantResponseResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (process.env.NODE_ENV === "test") {
    return buildFallbackResult(draftResponse, "test_mode");
  }

  if (!apiKey) {
    return buildFallbackResult(draftResponse, "no_api_key");
  }

  try {
    const response = await fetch(openaiResponsesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || defaultModel,
        instructions: buildInstructions(),
        input: buildInput({
          userInput,
          intent,
          draftResponse,
          session
        }),
        max_output_tokens: 240
      })
    });

    if (!response.ok) {
      return buildFallbackResult(draftResponse, "http_error");
    }

    const data = (await response.json()) as unknown;
    const assistantMessage = extractOutputText(data);

    if (!assistantMessage) {
      return buildFallbackResult(draftResponse, "empty_output");
    }

    return {
      assistantMessage,
      source: "llm",
      reason: "llm_success"
    };
  } catch {
    return buildFallbackResult(draftResponse, "request_failed");
  }
}

function buildFallbackResult(
  assistantMessage: string,
  reason: Exclude<ResponseReason, "llm_success">
): GenerateAssistantResponseResult {
  return {
    assistantMessage,
    source: "fallback",
    reason
  };
}

function buildInstructions(): string {
  return systemPrompt;
}

function buildInput({
  userInput,
  intent,
  draftResponse,
  session
}: GenerateAssistantResponseInput): string {
  return [
    `User message: ${userInput}`,
    `Interpreted user intent: ${JSON.stringify(intent)}`,
    `Current conversation state: ${session.state}`,
    `Current qualification answers: ${JSON.stringify(session.qualification)}`,
    `Current reboot step index: ${session.rebootStepIndex}`,
    `Current reboot step: ${getCurrentRebootStepText(session)}`,
    "",
    "Manual-grounded reboot context:",
    buildManualContext(),
    "",
    "Deterministic draft response to preserve:",
    draftResponse,
    "",
    "Generate the assistant response for this turn.",
    "If the user asked a question, answer it using the manual-grounded context, then continue with the deterministic draft response when it contains the active prompt or step.",
    "If the user gave an answer or progress update, phrase the deterministic draft response naturally.",
    "For current-step questions, use the active reboot step or qualification prompt plus the user's message to give the clarification.",
    "For partial wait progress such as 'I waited 5 seconds' on a 10-second step, answer with the remaining wait in natural language, then restate the current step.",
    "Do not remove required answer options such as yes, no, or not sure.",
    "Do not remove safety warnings or stop/contact-support guidance.",
    "End by restating the active question or reboot step when the deterministic draft includes one.",
    "Do not change the troubleshooting state, qualification decision, reboot step order, or exit outcome.",
    "Do not invent reboot steps.",
    "Do not tell the user to press or hold the Reset button.",
    "When the draft contains a reboot step instruction, present that exact step. Do not reference, summarise, or imply completion of any other step number. If the draft says Step 2, your response must present Step 2 — never Step 3 or any other step."
  ].join("\n");
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

  if (!session.state.startsWith("REBOOT_STEP_") || !step) {
    return "none";
  }

  return `${step.instruction} ${step.confirmationPrompt}`;
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
