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

  try {
    const response = await fetch(openaiResponsesUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || defaultModel,
        instructions: buildClassifierInstructions(),
        input: buildClassifierInput(userInput, session),
        text: {
          format: intentResponseFormat
        },
        max_output_tokens: 160
      })
    });

    if (!response.ok) {
      return buildFallbackResult(fallbackIntent, "http_error");
    }

    const outputText = extractOutputText((await response.json()) as unknown);

    if (!outputText) {
      return buildFallbackResult(fallbackIntent, "empty_output");
    }

    const parsedIntent = parseIntent(outputText);

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

const intentResponseFormat = {
  type: "json_schema",
  name: "user_intent",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: {
        enum: ["question", "answer", "completion", "greeting", "unknown"]
      },
      value: {
        anyOf: [{ enum: [...answerValues] }, { type: "null" }]
      },
      text: {
        anyOf: [{ type: "string" }, { type: "null" }]
      },
    },
    required: ["type", "value", "text"]
  }
};

function buildClassifierInstructions(): string {
  return [
    "Classify one user message for a deterministic WiFi support workflow.",
    "Return only JSON matching the provided schema.",
    "Never choose the next state, decide reboot appropriateness, or write qualification fields.",
    "Use type question for clarification requests, greeting for greetings, unknown when unclear.",
    "Use type answer with value yes, no, unsure, single_device, multiple_devices, general_connectivity, or specific_service.",
    "Use type completion only when the current state starts with REBOOT_STEP or is REBOOT_INTRO. Never use completion in START, QUALIFYING, or CHECK_RESOLUTION states.",
    "Never use completion if the message contains negation or indicates the step is not finished, such as 'not done', 'not done yet', 'still waiting', 'haven't done it', or similar. Classify those as unknown instead.",
    "At START, use greeting for greetings and unknown for non-problem messages. When the user describes any WiFi or internet problem (slow internet, no connection, dropped signal, etc.), use answer with value general_connectivity unless they clearly name a single app or website, in which case use specific_service.",
    "For connectivity scope, classify 'not just one app', 'every app', 'all websites', 'everything', and 'nothing loads' as general_connectivity.",
    "Classify 'only one app', 'only one website', 'just Netflix', 'just YouTube', or another single named app/site as specific_service."
  ].join("\n");
}

function buildClassifierInput(
  userInput: string,
  session: ConversationSession
): string {
  return [
    `Current state: ${session.state}`,
    `Current qualification question: ${getCurrentQuestionPrompt(session)}`,
    `Current reboot step: ${getCurrentRebootStepText(session)}`,
    `Existing qualification answers: ${JSON.stringify(session.qualification)}`,
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

type ParseIntentResult =
  | {
      ok: true;
      intent: UserIntent;
    }
  | {
      ok: false;
      reason: "parse_failed" | "schema_invalid";
    };

function parseIntent(outputText: string): ParseIntentResult {
  try {
    const normalizedIntent = normalizeIntent(JSON.parse(outputText));

    if (!normalizedIntent) {
      return {
        ok: false,
        reason: "schema_invalid"
      };
    }

    return {
      ok: true,
      intent: normalizedIntent
    };
  } catch {
    return {
      ok: false,
      reason: "parse_failed"
    };
  }
}

function buildFallbackResult(
  intent: UserIntent,
  reason: Exclude<ClassifierReason, "llm_success">
): ClassifyUserIntentResult {
  return {
    intent,
    source: "fallback",
    reason
  };
}

function normalizeIntent(value: unknown): UserIntent | null {
  if (!isRecord(value) || !isIntentType(value.type)) {
    return null;
  }

  const text = typeof value.text === "string" ? value.text : undefined;

  if (value.type === "question") {
    return { type: "question", text: text ?? "" };
  }

  if (value.type === "answer") {
    if (!isAnswerValue(value.value)) {
      return null;
    }

    return {
      type: "answer",
      value: value.value,
      ...(text ? { text } : {})
    };
  }

  if (value.type === "completion") {
    return {
      type: "completion",
      ...(text ? { text } : {})
    };
  }

  if (value.type === "greeting") {
    return { type: "greeting", ...(text ? { text } : {}) };
  }

  return { type: "unknown", ...(text ? { text } : {}) };
}

function isIntentType(value: unknown): value is UserIntent["type"] {
  return (
    value === "question" ||
    value === "answer" ||
    value === "completion" ||
    value === "greeting" ||
    value === "unknown"
  );
}

function isAnswerValue(value: unknown): value is AnswerValue {
  return answerValues.some((answerValue) => answerValue === value);
}

function isRebootStepState(state: ConversationState): boolean {
  return state.startsWith("REBOOT_STEP_");
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
