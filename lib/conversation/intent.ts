import {
  confirmationAnswerValues,
  connectivityScopeValues,
  deviceImpactValues
} from "./constants";

export const answerValues = [
  ...confirmationAnswerValues,
  ...deviceImpactValues,
  ...connectivityScopeValues
] as const;

export type AnswerValue = (typeof answerValues)[number];
export type ConfirmationAnswer = Extract<AnswerValue, "yes" | "no" | "unsure">;

export type QuestionIntent = {
  type: "question";
  text: string;
};

export type AnswerIntent = {
  type: "answer";
  value: AnswerValue;
  text?: string;
};

export type CompletionIntent = {
  type: "completion";
  text?: string;
};

export type GreetingIntent = {
  type: "greeting";
  text?: string;
};

export type UnknownIntent = {
  type: "unknown";
  text?: string;
};

export type UserIntent =
  | QuestionIntent
  | AnswerIntent
  | CompletionIntent
  | GreetingIntent
  | UnknownIntent;
