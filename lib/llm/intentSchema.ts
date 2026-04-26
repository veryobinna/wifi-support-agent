import {
  answerValues,
  type AnswerValue,
  type UserIntent
} from "@/lib/conversation/intent";
import type { ResponseFormatTextJSONSchemaConfig } from "openai/resources/responses/responses";
import type { ClassifierConfig } from "./classifierPlaybook";

export type ParseIntentResult =
  | { ok: true; intent: UserIntent }
  | { ok: false; reason: "parse_failed" | "schema_invalid" };

export function buildSchema(
  config: ClassifierConfig
): ResponseFormatTextJSONSchemaConfig {
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

export function parseIntent(
  outputText: string,
  config: ClassifierConfig
): ParseIntentResult {
  try {
    const normalizedIntent = normalizeIntent(JSON.parse(outputText), config);

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
    answerValues.some((answerValue) => answerValue === value) &&
    (config.validValues as string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
