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

export type ClassifyUserIntentResult = {
  intent: UserIntent;
  source: "llm" | "fallback";
};

const openaiResponsesUrl = "https://api.openai.com/v1/responses";
const defaultModel = "gpt-4o-mini";

export async function classifyUserIntent({
  userInput,
  session
}: ClassifyUserIntentInput): Promise<ClassifyUserIntentResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const fallbackIntent = fallbackClassifyUserIntent({ userInput, session });

  if (!apiKey || process.env.NODE_ENV === "test") {
    return {
      intent: fallbackIntent,
      source: "fallback"
    };
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
      return {
        intent: fallbackIntent,
        source: "fallback"
      };
    }

    const outputText = extractOutputText((await response.json()) as unknown);

    if (!outputText) {
      return {
        intent: fallbackIntent,
        source: "fallback"
      };
    }

    const parsedIntent = parseIntent(outputText);

    if (!parsedIntent) {
      return {
        intent: fallbackIntent,
        source: "fallback"
      };
    }

    return {
      intent: parsedIntent,
      source: "llm"
    };
  } catch {
    return {
      intent: fallbackIntent,
      source: "fallback"
    };
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
        enum: [...answerValues]
      },
      text: {
        type: "string"
      },
      waitedSeconds: {
        type: "number"
      }
    },
    required: ["type"]
  }
};

function buildClassifierInstructions(): string {
  return [
    "Classify one user message for a deterministic WiFi support workflow.",
    "Return only JSON matching the provided schema.",
    "Never choose the next state, decide reboot appropriateness, or write qualification fields.",
    "Use type question for clarification requests, greeting for greetings, completion for completed reboot steps, unknown when unclear.",
    "Use type answer with value yes, no, unsure, single_device, multiple_devices, general_connectivity, or specific_service.",
    "At START, use greeting for greetings and unknown for non-problem messages. Use answer only when the user describes a WiFi, internet, or connectivity issue.",
    "For connectivity scope, classify 'not just one app', 'every app', 'all websites', 'everything', and 'nothing loads' as general_connectivity.",
    "Classify 'only one app', 'only one website', 'just Netflix', 'just YouTube', or another single named app/site as specific_service.",
    "For completed wait steps, set waitedSeconds when the user states a duration."
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

function parseIntent(outputText: string): UserIntent | null {
  try {
    return normalizeIntent(JSON.parse(outputText));
  } catch {
    return null;
  }
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
    const waitedSeconds =
      typeof value.waitedSeconds === "number" &&
      Number.isFinite(value.waitedSeconds)
        ? value.waitedSeconds
        : undefined;

    return {
      type: "completion",
      ...(waitedSeconds !== undefined ? { waitedSeconds } : {}),
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
