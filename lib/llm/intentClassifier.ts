import type { UserIntent } from "@/lib/conversation/intent";
import { rebootStepStates } from "@/lib/conversation/constants";
import {
  getNextQualificationQuestion,
  getQualificationQuestion
} from "@/lib/conversation/qualification";
import { rebootSteps } from "@/lib/conversation/rebootSteps";
import type {
  ConversationSession,
  ConversationState
} from "@/lib/conversation/state";
import { getClassifierConfig } from "./classifierPlaybook";
import { fallbackClassifyUserIntent } from "./fallbackIntentClassifier";
import { buildSchema, parseIntent } from "./intentSchema";
import { logLlmFailure } from "@/lib/observability/logger";
import { getOpenAIClient } from "./openaiClient";

export type ClassifyUserIntentInput = {
  turnId?: string;
  userInput: string;
  session: ConversationSession;
};

export type ClassifierSource = "llm" | "fallback";

export type ClassifierReason =
  | "llm_success"
  | "test_mode"
  | "no_api_key"
  | "terminal_skip"
  | "http_error"
  | "empty_output"
  | "parse_failed"
  | "schema_invalid"
  | "request_failed";

export type ClassifyUserIntentResult = {
  intent: UserIntent;
  source: ClassifierSource;
  reason: ClassifierReason;
};

const defaultModel = "gpt-4o-mini";

export async function classifyUserIntent({
  turnId,
  userInput,
  session
}: ClassifyUserIntentInput): Promise<ClassifyUserIntentResult> {
  const fallbackIntent = fallbackClassifyUserIntent({ userInput, session });
  const model = process.env.OPENAI_MODEL?.trim() || defaultModel;

  if (process.env.NODE_ENV === "test") {
    return buildFallbackResult(fallbackIntent, "test_mode");
  }

  const client = getOpenAIClient();

  if (!client) {
    return buildFallbackResult(fallbackIntent, "no_api_key");
  }

  const questionId =
    session.currentQuestionId ??
    getNextQualificationQuestion(session.qualification)?.id ??
    null;

  const config = getClassifierConfig(session.state, questionId);
  const llmRequest = {
    model,
    instructions: config.instructions,
    input: buildClassifierInput(userInput, session),
    text: {
      format: buildSchema(config)
    },
    max_output_tokens: 120
  };
  try {
    const response = await client.responses.create(llmRequest);

    const outputText = extractOutputText(response as unknown);

    if (!outputText) {
      logLlmFailure({
        event: "llm.classifier_failure",
        turnId,
        reason: "empty_output",
        model
      });
      return buildFallbackResult(fallbackIntent, "empty_output");
    }

    const parsedIntent = parseIntent(outputText, config);

    if (!parsedIntent.ok) {
      logLlmFailure({
        event: "llm.classifier_failure",
        turnId,
        reason: parsedIntent.reason,
        model
      });
      return buildFallbackResult(fallbackIntent, parsedIntent.reason);
    }

    return {
      intent: parsedIntent.intent,
      source: "llm",
      reason: "llm_success"
    };
  } catch (error) {
    if (isHttpError(error)) {
      logLlmFailure({
        event: "llm.classifier_failure",
        turnId,
        reason: "http_error",
        model,
        httpStatus: error.status,
        httpStatusText: error.name
      });
      return buildFallbackResult(fallbackIntent, "http_error");
    }

    logLlmFailure({
      event: "llm.classifier_failure",
      turnId,
      reason: "request_failed",
      model,
      error
    });
    return buildFallbackResult(fallbackIntent, "request_failed");
  }
}

// ─── Classifier input ─────────────────────────────────────────

function buildClassifierInput(
  userInput: string,
  session: ConversationSession
): string {
  return [
    `Current state: ${session.state}`,
    `Current qualification question: ${getCurrentQuestionPrompt(session)}`,
    `Current reboot step: ${getCurrentRebootStepText(session)}`,
    `User message: ${userInput}`
  ].join("\n");
}

function getCurrentQuestionPrompt(session: ConversationSession): string {
  const question = session.currentQuestionId
    ? getQualificationQuestion(session.currentQuestionId)
    : getNextQualificationQuestion(session.qualification);

  return question?.prompt ?? "none";
}

function getCurrentRebootStepText(session: ConversationSession): string {
  const step = rebootSteps[session.rebootStepIndex];

  if (!isRebootStepState(session.state) || !step) {
    return "none";
  }

  return `${step.instruction} ${step.confirmationPrompt}`;
}

// ─── Helpers ──────────────────────────────────────────────────

function buildFallbackResult(
  intent: UserIntent,
  reason: Exclude<ClassifierReason, "llm_success">
): ClassifyUserIntentResult {
  return { intent, source: "fallback", reason };
}

function isRebootStepState(state: ConversationState): boolean {
  return rebootStepStates.includes(state as (typeof rebootStepStates)[number]);
}

function extractOutputText(data: unknown): string | null {
  if (!isRecord(data)) return null;

  const outputText = data.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const output = data.output;
  if (!Array.isArray(output)) return null;

  const textParts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const contentItem of item.content) {
      if (!isRecord(contentItem)) continue;
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
