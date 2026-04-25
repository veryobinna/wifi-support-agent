export type DeviceImpact = "single_device" | "multiple_devices";

export type ConnectivityScope = "general_connectivity" | "specific_service";

export type EquipmentStatus = "powered_and_connected" | "power_or_cable_issue";

export type QualificationAnswers = {
  deviceImpact?: DeviceImpact;
  connectivityScope?: ConnectivityScope;
  equipmentStatus?: EquipmentStatus;
  knownOutage?: boolean;
  canAccessEquipment?: boolean;
  acceptsTemporaryInterruption?: boolean;
};

export const qualificationQuestionIds = [
  "deviceImpact",
  "connectivityScope",
  "equipmentStatus",
  "knownOutage",
  "canAccessEquipment",
  "acceptsTemporaryInterruption"
] as const;

export type QualificationQuestionId = (typeof qualificationQuestionIds)[number];

export type QualificationQuestion = {
  id: QualificationQuestionId;
  answerKey: keyof QualificationAnswers;
  prompt: string;
  retryPrompt: string;
};

export type QualificationStatus = "appropriate" | "not_appropriate" | "unknown";

export type QualificationDecision = {
  status: QualificationStatus;
  reason: string;
};

export const qualificationQuestions: QualificationQuestion[] = [
  {
    id: "deviceImpact",
    answerKey: "deviceImpact",
    prompt: "Is the problem affecting one device or multiple devices?",
    retryPrompt:
      "Is this affecting one device, or are multiple devices having the same problem?"
  },
  {
    id: "connectivityScope",
    answerKey: "connectivityScope",
    prompt:
      "Is this a general WiFi or internet problem, or is it only one app or website?",
    retryPrompt:
      "Is the issue general internet/WiFi access, or only a specific app or website?"
  },
  {
    id: "equipmentStatus",
    answerKey: "equipmentStatus",
    prompt:
      "Are the modem and router powered on with their power and network cables firmly connected?",
    retryPrompt:
      "Are both the modem and router powered on and firmly connected, yes or no?"
  },
  {
    id: "knownOutage",
    answerKey: "knownOutage",
    prompt: "Do you know of an internet service provider outage in your area?",
    retryPrompt:
      "Do you know of an ISP outage in your area? Please answer yes, no, or not sure."
  },
  {
    id: "canAccessEquipment",
    answerKey: "canAccessEquipment",
    prompt: "Can you safely reach the router and modem power cords?",
    retryPrompt:
      "Can you safely access the router and modem power cords, yes or no?"
  },
  {
    id: "acceptsTemporaryInterruption",
    answerKey: "acceptsTemporaryInterruption",
    prompt:
      "A reboot will temporarily disconnect the internet. Is now an okay time to do that?",
    retryPrompt:
      "Is it okay for the internet to disconnect briefly while the router reboots, yes or no?"
  }
];

export function decideRebootAppropriateness(
  answers: QualificationAnswers
): QualificationDecision {
  if (answers.deviceImpact === "single_device") {
    return {
      status: "not_appropriate",
      reason:
        "A router reboot is not the best first step because only one device appears to be affected."
    };
  }

  if (answers.connectivityScope === "specific_service") {
    return {
      status: "not_appropriate",
      reason:
        "A router reboot is not the best first step because the issue appears limited to one app or website."
    };
  }

  if (answers.equipmentStatus === "power_or_cable_issue") {
    return {
      status: "not_appropriate",
      reason:
        "A router reboot should wait until the modem and router power and network cables are firmly connected."
    };
  }

  if (answers.knownOutage === true) {
    return {
      status: "not_appropriate",
      reason:
        "A router reboot is unlikely to help while there is a known internet service provider outage."
    };
  }

  if (answers.canAccessEquipment === false) {
    return {
      status: "not_appropriate",
      reason:
        "A router reboot is not appropriate if you cannot safely reach the router and modem."
    };
  }

  if (answers.acceptsTemporaryInterruption === false) {
    return {
      status: "not_appropriate",
      reason:
        "A router reboot is not appropriate right now because it will briefly disconnect the internet."
    };
  }

  if (
    answers.deviceImpact === "multiple_devices" &&
    answers.connectivityScope === "general_connectivity" &&
    answers.equipmentStatus === "powered_and_connected" &&
    answers.knownOutage === false &&
    answers.canAccessEquipment === true &&
    answers.acceptsTemporaryInterruption === true
  ) {
    return {
      status: "appropriate",
      reason:
        "Multiple devices have a general connectivity issue, the equipment is connected, there is no known outage, and the user can safely reboot now."
    };
  }

  return {
    status: "unknown",
    reason: "More information is needed before recommending a router reboot."
  };
}

export function getQualificationQuestion(
  questionId: QualificationQuestionId
): QualificationQuestion {
  return qualificationQuestions.find((question) => question.id === questionId)!;
}

export function getNextQualificationQuestion(
  answers: QualificationAnswers
): QualificationQuestion | null {
  return (
    qualificationQuestions.find(
      (question) => answers[question.answerKey] === undefined
    ) ?? null
  );
}

export function inferIssueOverview(input: string): QualificationAnswers {
  return {
    ...inferDeviceImpact(input),
    ...inferConnectivityScope(input)
  };
}

export function inferAnswerForQuestion(
  questionId: QualificationQuestionId,
  input: string
): Partial<QualificationAnswers> | null {
  switch (questionId) {
    case "deviceImpact":
      return inferDeviceImpact(input);
    case "connectivityScope":
      return inferConnectivityScope(input);
    case "equipmentStatus":
      return inferEquipmentStatus(input);
    case "knownOutage":
      return inferKnownOutage(input);
    case "canAccessEquipment":
      return inferBooleanAnswer(input, "canAccessEquipment");
    case "acceptsTemporaryInterruption":
      return inferBooleanAnswer(input, "acceptsTemporaryInterruption");
  }
}

export function parseYesNo(input: string): boolean | null {
  const normalized = normalizeInput(input);

  if (isUncertain(normalized)) {
    return null;
  }

  if (
    hasAny(normalized, [
      "no",
      "nope",
      "not",
      "can't",
      "cannot",
      "cant",
      "do not",
      "don't",
      "dont",
      "won't",
      "wont",
      "never"
    ])
  ) {
    return false;
  }

  if (
    hasAny(normalized, [
      "yes",
      "yeah",
      "yep",
      "sure",
      "ok",
      "okay",
      "ready",
      "correct",
      "true",
      "i can",
      "we can",
      "go ahead"
    ])
  ) {
    return true;
  }

  return null;
}

function inferDeviceImpact(input: string): Partial<QualificationAnswers> | null {
  const normalized = normalizeInput(input);

  if (
    hasAny(normalized, [
      "multiple",
      "several",
      "many",
      "all devices",
      "every device",
      "everyone",
      "both devices",
      "whole house",
      "all of them"
    ])
  ) {
    return { deviceImpact: "multiple_devices" };
  }

  if (
    hasAny(normalized, [
      "one device",
      "single device",
      "only one",
      "just one",
      "only my phone",
      "only my laptop",
      "just my phone",
      "just my laptop"
    ])
  ) {
    return { deviceImpact: "single_device" };
  }

  return null;
}

function inferConnectivityScope(
  input: string
): Partial<QualificationAnswers> | null {
  const normalized = normalizeInput(input);

  if (
    hasAny(normalized, [
      "one app",
      "one website",
      "single website",
      "specific site",
      "specific website",
      "specific app",
      "only netflix",
      "only youtube",
      "only email"
    ])
  ) {
    return { connectivityScope: "specific_service" };
  }

  if (
    hasAny(normalized, [
      "no internet",
      "internet is down",
      "wifi is down",
      "wi fi is down",
      "offline",
      "nothing loads",
      "general",
      "all sites",
      "all websites",
      "any website",
      "no connection",
      "can't connect",
      "cant connect"
    ])
  ) {
    return { connectivityScope: "general_connectivity" };
  }

  return null;
}

function inferEquipmentStatus(
  input: string
): Partial<QualificationAnswers> | null {
  const normalized = normalizeInput(input);

  if (
    hasAny(normalized, [
      "unplugged",
      "loose",
      "no power",
      "powered off",
      "off",
      "not connected",
      "cable is out",
      "cables are out"
    ])
  ) {
    return { equipmentStatus: "power_or_cable_issue" };
  }

  const answer = parseYesNo(input);

  if (answer === true) {
    return { equipmentStatus: "powered_and_connected" };
  }

  if (answer === false) {
    return { equipmentStatus: "power_or_cable_issue" };
  }

  return null;
}

function inferKnownOutage(
  input: string
): Partial<QualificationAnswers> | null {
  const normalized = normalizeInput(input);

  if (
    hasAny(normalized, [
      "no outage",
      "no known outage",
      "not aware",
      "none",
      "provider says no",
      "isp says no"
    ])
  ) {
    return { knownOutage: false };
  }

  const answer = parseYesNo(input);

  if (answer === null) {
    return null;
  }

  return { knownOutage: answer };
}

function inferBooleanAnswer<Key extends keyof QualificationAnswers>(
  input: string,
  key: Key
): Pick<QualificationAnswers, Key> | null {
  const answer = parseYesNo(input);

  if (answer === null) {
    return null;
  }

  return {
    [key]: answer
  } as Pick<QualificationAnswers, Key>;
}

function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replaceAll("’", "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUncertain(normalizedInput: string): boolean {
  return hasAny(normalizedInput, [
    "i don't know",
    "i dont know",
    "not sure",
    "unsure",
    "unknown",
    "maybe"
  ]);
}

function hasAny(normalizedInput: string, phrases: string[]): boolean {
  return phrases.some((phrase) => {
    const escapedPhrase = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
    const phrasePattern = new RegExp(`(^|\\s)${escapedPhrase}(?=\\s|$)`);

    return phrasePattern.test(normalizedInput);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
