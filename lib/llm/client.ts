import {
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
  "You will ALWAYS receive a <draft_response> that contains the exact next message or question required by the workflow.",
  "Your job: Answer the user's actual question helpfully and concretely, THEN smoothly incorporate the full meaning of the <draft_response>.",
  
  "Rules:",
  "- First address what the user asked (especially 'how long', 'how do I', 'what is'). Give concrete, actionable info using your knowledge of the reboot process.",
  "- Then blend in the draft_response naturally without omitting its core content or safety instructions.",
  "- During qualification: Keep the exact intent of the draft question (e.g., still ask if now is okay to reboot).",
  "- Add brief warmth only when it fits naturally ('Got it', 'Take your time', etc.).",
  "- Never invent new reboot steps or suggest pressing the Reset button.",
  "- Keep total response concise: 2-4 sentences maximum.",
  
  "Examples:",
  "Draft: 'A reboot will temporarily disconnect the internet. Is now an okay time to do that?'",
  "User: 'How long would it take?'",
  "Good output: 'The full power-cycle process (modem + router) usually takes about 3 to 5 minutes total. A reboot will temporarily disconnect the internet. Is now an okay time to do that?'",
  
  "Draft: same as above",
  "User: 'for how long?'",
  "Good output: 'It typically takes 3-5 minutes for everything to come back online. A reboot will temporarily disconnect the internet. Is now an okay time to do that?'",
  
  "Do not output XML tags or mention 'draft'. Return only the final message the user should see."
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
