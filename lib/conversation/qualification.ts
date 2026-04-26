import {
  connectivityScope,
  connectivityScopeValues,
  deviceImpact,
  deviceImpactValues,
  equipmentStatus,
  equipmentStatusValues,
  qualificationQuestionIds,
  qualificationStatus,
  qualificationStatusValues
} from "./constants";

export type DeviceImpact = (typeof deviceImpactValues)[number];

export type ConnectivityScope = (typeof connectivityScopeValues)[number];

export type EquipmentStatus = (typeof equipmentStatusValues)[number];

export type QualificationAnswers = {
  deviceImpact?: DeviceImpact;
  connectivityScope?: ConnectivityScope;
  equipmentStatus?: EquipmentStatus;
  knownOutage?: boolean;
  canAccessEquipment?: boolean;
  acceptsTemporaryInterruption?: boolean;
};

export { qualificationQuestionIds };

export type QualificationQuestionId = (typeof qualificationQuestionIds)[number];

export type QualificationQuestion = {
  id: QualificationQuestionId;
  answerKey: keyof QualificationAnswers;
  prompt: string;
  retryPrompt: string;
};

export type QualificationStatus = (typeof qualificationStatusValues)[number];

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
  if (answers.deviceImpact === deviceImpact.singleDevice) {
    return {
      status: qualificationStatus.notAppropriate,
      reason:
        "A router reboot is not the best first step because only one device appears to be affected."
    };
  }

  if (answers.connectivityScope === connectivityScope.specificService) {
    return {
      status: qualificationStatus.notAppropriate,
      reason:
        "A router reboot is not the best first step because the issue appears limited to one app or website."
    };
  }

  if (answers.equipmentStatus === equipmentStatus.powerOrCableIssue) {
    return {
      status: qualificationStatus.notAppropriate,
      reason:
        "A router reboot should wait until the modem and router power and network cables are firmly connected."
    };
  }

  if (answers.knownOutage === true) {
    return {
      status: qualificationStatus.notAppropriate,
      reason:
        "A router reboot is unlikely to help while there is a known internet service provider outage."
    };
  }

  if (answers.canAccessEquipment === false) {
    return {
      status: qualificationStatus.notAppropriate,
      reason:
        "A router reboot is not appropriate if you cannot safely reach the router and modem."
    };
  }

  if (answers.acceptsTemporaryInterruption === false) {
    return {
      status: qualificationStatus.notAppropriate,
      reason:
        "A router reboot is not appropriate right now because it will briefly disconnect the internet."
    };
  }

  if (
    answers.deviceImpact === deviceImpact.multipleDevices &&
    answers.connectivityScope === connectivityScope.generalConnectivity &&
    answers.equipmentStatus === equipmentStatus.poweredAndConnected &&
    answers.knownOutage === false &&
    answers.canAccessEquipment === true &&
    answers.acceptsTemporaryInterruption === true
  ) {
    return {
      status: qualificationStatus.appropriate,
      reason:
        "Multiple devices have a general connectivity issue, the equipment is connected, there is no known outage, and the user can safely reboot now."
    };
  }

  return {
    status: qualificationStatus.unknown,
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
