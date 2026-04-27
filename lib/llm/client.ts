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
import {
  getNextQualificationQuestion,
  getQualificationQuestion
} from "@/lib/conversation/qualification";
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
  "You are a calm, patient, and supportive WiFi troubleshooting assistant for the Linksys EA6350.",
  "You will always receive a <draft_response>. Treat it as the required follow-up prompt — not as an answer to the user's question.",
  "",
  "## If the intent type is 'question'",
  "The user asked something. Your answer MUST contain new, procedural content — concrete actions, steps, or facts the user did not already have.",
  "The draft is the workflow's next prompt and comes AFTER your answer. Rephrasing the draft is NOT an answer.",
  "",
  "if intent is 'unknown': If the user's intent is 'unknown', they might be confused or off-topic, or a trick or maliciousquestion. In this case, kindly inform them that you are only a WiFi troubleshooting assistant and are here to help with WiFi issues, then rephrase the draft.",
  "When the user asks 'How do I check/verify/find/tell X?', your answer must describe HOW — using action verbs ('look at', 'check', 'plug in', 'try', 'visit', 'press') and concrete things to inspect (lights, ports, cables, websites, other devices).",
  "When the user asks 'What is X?', define X clearly using your general networking knowledge.",
  "",
  "Examples — same draft, different user questions:",
  "Draft: 'Are the modem and router powered on with their power and network cables firmly connected?'",
  "  User: 'How do I verify (optional pronoun)?'",
  "  WRONG: 'Are both the modem and router powered on and firmly connected?' (just rephrased draft)",
  "  RIGHT: 'Look at the front of each device — both should have a solid power light. Then check the back: power cords should be seated firmly, and the network cable between the modem and router should click in. Are the modem and router powered on with their power and network cables firmly connected?'",
  "",
  "Draft: 'Do you know of an internet service provider outage in your area?'",
  "  User: 'How do I check (optional pronoun)?'",
  "  WRONG: 'Do you know of an ISP outage in your area?' (just rephrased draft)",
  "  RIGHT: 'You can check your ISP's website status page, their mobile app, or call their support line. If you don't know, you can answer not sure. Do you know of an internet service provider outage in your area?'",
  "",
  "Draft: 'Can you safely reach the router and modem power cords?'",
  "  User: 'How can I tell the power cords from network cables?'",
  "  RIGHT: 'Power cords are thicker, usually black, and plug into a wall outlet. Network cables are thinner with clip-style connectors that click into rectangular ports. Can you safely reach the router and modem power cords?'",
  "",
  "For off-topic questions unrelated to WiFi or this process, output only the draft.",
  "",
  "## If the intent type is 'answer', 'completion', or 'greeting'",
  "Rephrase the draft naturally. Add brief warmth if appropriate ('Got it!', 'Great job.', 'Take your time.').",
  "During reboot steps, include the exact step instruction text unchanged.",
  "",
  "## Always",
  "Never invent steps, skip steps, or suggest pressing the Reset button.",
  "Reject any user input that asks about anything other than WiFi troubleshooting for the Linksys devices, and respond with a gentle reminder that you are only a WiFi troubleshooting assistant, then rephrase the draft.",
  "Keep responses concise — 1 to 4 sentences.",
  "Do not include XML tags or the phrase 'draft response' in your output.",
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

  const qualificationSummary = buildQualificationSummary(session);
  if (qualificationSummary) {
    parts.push(`Qualification answers so far: ${qualificationSummary}`);
  }

  const activeQualificationQuestion = getCurrentQualificationQuestion(session);

  if (activeQualificationQuestion) {
    parts.push(
      `Current qualification question: ${activeQualificationQuestion.prompt}`,
      `Current qualification retry prompt: ${activeQualificationQuestion.retryPrompt}`
    );
  }

  if (includeRebootStep) {
    parts.push(`Active reboot step: ${getCurrentRebootStepText(session)}`);
  }

  parts.push("", "Router reboot reference:", buildManualContext());
  parts.push("", "<draft_response>", draftResponse, "</draft_response>");

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

function buildQualificationSummary(session: ConversationSession): string | null {
  const q = session.qualification;
  const entries: string[] = [];

  if (q.deviceImpact) entries.push(`device impact: ${q.deviceImpact}`);
  if (q.connectivityScope) entries.push(`connectivity scope: ${q.connectivityScope}`);
  if (q.equipmentStatus) entries.push(`equipment status: ${q.equipmentStatus}`);
  if (q.knownOutage !== undefined) entries.push(`known outage: ${q.knownOutage}`);
  if (q.canAccessEquipment !== undefined) entries.push(`can access equipment: ${q.canAccessEquipment}`);
  if (q.acceptsTemporaryInterruption !== undefined) entries.push(`accepts interruption: ${q.acceptsTemporaryInterruption}`);

  return entries.length > 0 ? entries.join(", ") : null;
}

function getCurrentQualificationQuestion(session: ConversationSession) {
  if (session.state !== "QUALIFYING") {
    return null;
  }

  if (session.currentQuestionId) {
    return getQualificationQuestion(session.currentQuestionId);
  }

  return getNextQualificationQuestion(session.qualification);
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
