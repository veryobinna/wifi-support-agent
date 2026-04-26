import {
  answerValues,
  type AnswerValue,
  type UserIntent
} from "@/lib/conversation/intent";
import {
  getNextQualificationQuestion,
  getQualificationQuestion
} from "@/lib/conversation/qualification";
import { rebootSteps } from "@/lib/conversation/rebootSteps";
import type {
  ConversationSession,
  ConversationState
} from "@/lib/conversation/state";
import { getClassifierConfig, type ClassifierConfig } from "./classifierPlaybook";
import { fallbackClassifyUserIntent } from "./fallbackIntentClassifier";

export type ClassifyUserIntentInput = {
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

const openaiResponsesUrl = "https://api.openai.com/v1/responses";
const defaultModel = "gpt-4o-mini";

export async function classifyUserIntent({
  userInput,
  session
}: ClassifyUserIntentInput): Promise<ClassifyUserIntentResult> {
  const fallbackIntent = fallbackClassifyUserIntent({ userInput, session });
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (process.env.NODE_ENV === "test") {
    return buildFallbackResult(fallbackIntent, "test_mode");
  }

  if (!apiKey) {
    return buildFallbackResult(fallbackIntent, "no_api_key");
  }

  const questionId =
    session.currentQuestionId ??
    getNextQualificationQuestion(session.qualification)?.id ??
    null;

  const config = getClassifierConfig(session.state, questionId);

  try {
    const response = await fetch(openaiResponsesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || defaultModel,
        instructions: config.instructions,
        input: buildClassifierInput(userInput, session),
        text: {
          format: buildSchema(config)
        },
        max_output_tokens: 120
      })
    });

    if (!response.ok) {
      return buildFallbackResult(fallbackIntent, "http_error");
    }

    const outputText = extractOutputText((await response.json()) as unknown);

    if (!outputText) {
      return buildFallbackResult(fallbackIntent, "empty_output");
    }

    const parsedIntent = parseIntent(outputText, config);

    if (!parsedIntent.ok) {
      return buildFallbackResult(fallbackIntent, parsedIntent.reason);
    }

    return {
      intent: parsedIntent.intent,
      source: "llm",
      reason: "llm_success"
    };
  } catch {
    return buildFallbackResult(fallbackIntent, "request_failed");
  }
}

// ─── Schema builder ───────────────────────────────────────────

function buildSchema(config: ClassifierConfig) {
  const valueOptions =
    config.validValues.length > 0
      ? [{ enum: [...config.validValues] }, { type: "null" }]
      : [{ type: "null" }];

  return {
    type: "json_schema",
    name: "user_intent",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { enum: [...config.validTypes] },
        value: { anyOf: valueOptions },
        text: { anyOf: [{ type: "string" }, { type: "null" }] }
      },
      required: ["type", "value", "text"]
    }
  };
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

// ─── Intent parser ────────────────────────────────────────────

type ParseIntentResult =
  | { ok: true; intent: UserIntent }
  | { ok: false; reason: "parse_failed" | "schema_invalid" };

function parseIntent(
  outputText: string,
  config: ClassifierConfig
): ParseIntentResult {
  try {
    const normalizedIntent = normalizeIntent(
      JSON.parse(outputText),
      config
    );

    if (!normalizedIntent) {
      return { ok: false, reason: "schema_invalid" };
    }

    return { ok: true, intent: normalizedIntent };
  } catch {
    return { ok: false, reason: "parse_failed" };
  }
}

function normalizeIntent(
  value: unknown,
  config: ClassifierConfig
): UserIntent | null {
  if (!isRecord(value) || !isIntentType(value.type, config)) {
    return null;
  }

  const text = typeof value.text === "string" ? value.text : undefined;

  if (value.type === "question") {
    return { type: "question", text: text ?? "" };
  }

  if (value.type === "answer") {
    if (!isAnswerValue(value.value, config)) {
      return null;
    }
    return { type: "answer", value: value.value, ...(text ? { text } : {}) };
  }

  if (value.type === "completion") {
    return { type: "completion", ...(text ? { text } : {}) };
  }

  if (value.type === "greeting") {
    return { type: "greeting", ...(text ? { text } : {}) };
  }

  return { type: "unknown", ...(text ? { text } : {}) };
}

function isIntentType(
  value: unknown,
  config: ClassifierConfig
): value is UserIntent["type"] {
  return (
    typeof value === "string" &&
    (config.validTypes as string[]).includes(value)
  );
}

function isAnswerValue(
  value: unknown,
  config: ClassifierConfig
): value is AnswerValue {
  return (
    typeof value === "string" &&
    answerValues.some((v) => v === value) &&
    (config.validValues as string[]).includes(value)
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function buildFallbackResult(
  intent: UserIntent,
  reason: Exclude<ClassifierReason, "llm_success">
): ClassifyUserIntentResult {
  return { intent, source: "fallback", reason };
}

function isRebootStepState(state: ConversationState): boolean {
  return state.startsWith("REBOOT_STEP_");
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
