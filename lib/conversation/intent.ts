export const answerValues = [
  "yes",
  "no",
  "unsure",
  "single_device",
  "multiple_devices",
  "general_connectivity",
  "specific_service"
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
