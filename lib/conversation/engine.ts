import {
  confirmationAnswer,
  connectivityScope,
  conversationState,
  deviceImpact,
  equipmentStatus
} from "./constants";
import type { AnswerValue, ConfirmationAnswer, UserIntent } from "./intent";
import { rebootSteps, formatRebootStep } from "./rebootSteps";
import {
  rebootStepStates,
  type ConversationSession,
  type ConversationState
} from "./state";
import {
  decideRebootAppropriateness,
  getNextQualificationQuestion,
  getQualificationQuestion,
  type QualificationAnswers,
  type QualificationDecision,
  type QualificationQuestion
} from "./qualification";

export type ConversationTurn = {
  session: ConversationSession;
  assistantMessage: string;
  decision?: QualificationDecision;
};

const terminalStates = new Set<ConversationState>([
  conversationState.notAppropriateExit,
  conversationState.resolvedExit,
  conversationState.unresolvedExit
]);

export function isTerminalState(state: ConversationState): boolean {
  return terminalStates.has(state);
}

export function advanceConversation(
  session: ConversationSession,
  intent: UserIntent
): ConversationTurn {
  if (isTerminalState(session.state)) {
    return {
      session,
      assistantMessage:
        intent.type === "question"
          ? "This session has ended, so I am not able to answer further questions here. Please start a new chat and I will be happy to help."
          : "This session has ended. Please start a new chat if you need further help."
    };
  }

  if (session.state === conversationState.start) {
    return startQualification(session, intent);
  }

  if (session.state === conversationState.qualifying) {
    return continueQualification(session, intent);
  }

  if (session.state === conversationState.rebootIntro) {
    return startRebootWhenReady(session, intent);
  }

  if (isRebootStepState(session.state)) {
    return continueRebootSteps(session, intent);
  }

  if (session.state === conversationState.checkResolution) {
    return checkResolution(session, intent);
  }

  return startQualification(session, intent);
}

function startQualification(
  session: ConversationSession,
  intent: UserIntent
): ConversationTurn {
  if (intent.type === "greeting") {
    return {
      session,
      assistantMessage:
        "Hi. What WiFi or internet issue are you seeing?"
    };
  }

  if (intent.type === "question") {
    return {
      session,
      assistantMessage:
        "I can answer questions about the reboot flow, but first I need to understand the WiFi or internet issue. What WiFi or internet issue are you seeing?"
    };
  }

  if (intent.type !== "answer" || intent.value !== "yes") {
    return askForIssue(session);
  }

  const nextSession = {
    ...session,
    state: conversationState.qualifying,
    qualification: {}
  };

  return routeAfterQualificationUpdate(nextSession);
}

function continueQualification(
  session: ConversationSession,
  intent: UserIntent
): ConversationTurn {
  const question = session.currentQuestionId
    ? getQualificationQuestion(session.currentQuestionId)
    : getNextQualificationQuestion(session.qualification);

  if (!question) {
    return routeAfterQualificationUpdate(session);
  }

  const answer = getQualificationAnswerForQuestion(question, intent);

  if (!answer) {
    if (intent.type === "question") {
      return askQualificationQuestion(session, question, question.prompt);
    }

    return askQualificationQuestion(session, question, question.retryPrompt);
  }

  return routeAfterQualificationUpdate({
    ...session,
    qualification: {
      ...session.qualification,
      ...answer
    }
  });
}

function routeAfterQualificationUpdate(
  session: ConversationSession
): ConversationTurn {
  const decision = decideRebootAppropriateness(session.qualification);

  if (decision.status === "not_appropriate") {
    return {
      session: {
        ...session,
        state: conversationState.notAppropriateExit,
        currentQuestionId: null
      },
      assistantMessage: decision.reason,
      decision
    };
  }

  if (decision.status === "appropriate") {
    return {
      session: {
        ...session,
        state: conversationState.rebootIntro,
        currentQuestionId: null,
        rebootStepIndex: 0
      },
      assistantMessage:
        "A router reboot is appropriate based on your answers. This is different from a factory reset: do not press and hold the Reset button, because that can erase router settings. When you are ready, I will walk you through the power-cord reboot steps from the Linksys EA6350 manual. Are you ready to begin?",
      decision
    };
  }

  const nextQuestion = getNextQualificationQuestion(session.qualification);

  if (!nextQuestion) {
    return {
      session,
      assistantMessage:
        "I need one more detail before I can safely recommend a router reboot."
    };
  }

  return askQualificationQuestion(session, nextQuestion, nextQuestion.prompt);
}

function askQualificationQuestion(
  session: ConversationSession,
  question: QualificationQuestion,
  prompt: string
): ConversationTurn {
  return {
    session: {
      ...session,
      state: conversationState.qualifying,
      currentQuestionId: question.id
    },
    assistantMessage: prompt
  };
}

function startRebootWhenReady(
  session: ConversationSession,
  intent: UserIntent
): ConversationTurn {
  const confirmation = getConfirmationAnswer(intent);

  if (confirmation === confirmationAnswer.no) {
    return {
      session: {
        ...session,
        state: conversationState.notAppropriateExit
      },
      assistantMessage:
        "No problem. Rebooting can briefly interrupt internet access, so stop here and come back when it is safe and convenient."
    };
  }

  if (intent.type === "question") {
    return {
      session,
      assistantMessage:
        "A reboot turns the modem and router off and back on. It is not a factory reset, and you should not press or hold the Reset button. Are you ready to begin the power-cord reboot steps?"
    };
  }

  if (confirmation !== confirmationAnswer.yes && intent.type !== "completion") {
    return {
      session,
      assistantMessage:
        "Please confirm when you are ready to begin the reboot. Do not press the Reset button."
    };
  }

  return moveToRebootStep(session, 0);
}

function continueRebootSteps(
  session: ConversationSession,
  intent: UserIntent
): ConversationTurn {
  if (!isStepCompletion(session, intent)) {
    if (intent.type === "question") {
      return {
        session,
        assistantMessage: `I can clarify the current reboot step.\n\n${formatRebootStep(session.rebootStepIndex)}`
      };
    }

    if (intent.type === "completion" || intent.type === "answer") {
      return {
        session,
        assistantMessage: `This step is not complete yet.\n\n${formatRebootStep(session.rebootStepIndex)}`
      };
    }

    return {
      session,
      assistantMessage: `Take your time. ${formatRebootStep(session.rebootStepIndex)}`
    };
  }

  const nextStepIndex = session.rebootStepIndex + 1;

  if (nextStepIndex >= rebootSteps.length) {
    return {
      session: {
        ...session,
        state: conversationState.checkResolution,
        currentQuestionId: null,
        rebootStepIndex: rebootSteps.length - 1
      },
      assistantMessage:
        "Now try connecting to the internet again. Is the WiFi or internet issue resolved?"
    };
  }

  return moveToRebootStep(session, nextStepIndex);
}

function moveToRebootStep(
  session: ConversationSession,
  stepIndex: number
): ConversationTurn {
  return {
    session: {
      ...session,
      state: rebootStepStates[stepIndex],
      currentQuestionId: null,
      rebootStepIndex: stepIndex
    },
    assistantMessage: formatRebootStep(stepIndex)
  };
}

function checkResolution(
  session: ConversationSession,
  intent: UserIntent
): ConversationTurn {
  const confirmation = getConfirmationAnswer(intent);

  if (confirmation === confirmationAnswer.yes) {
    return {
      session: {
        ...session,
        state: conversationState.resolvedExit
      },
      assistantMessage:
        "Good. The reboot appears to have resolved the issue, so you are all set."
    };
  }

  if (confirmation === confirmationAnswer.no) {
    return {
      session: {
        ...session,
        state: conversationState.unresolvedExit
      },
      assistantMessage:
        "I am sorry the reboot did not resolve it. The next best step is to contact your internet service provider or Linksys support, especially if multiple devices are still affected."
    };
  }

  if (intent.type === "question") {
    return {
      session,
      assistantMessage:
        "If the issue is not resolved, I will point you toward your internet service provider or Linksys support. Is the WiFi or internet issue resolved?"
    };
  }

  return {
    session,
    assistantMessage:
      "Please answer yes or no: is the WiFi or internet issue resolved?"
  };
}

function isRebootStepState(state: ConversationState): boolean {
  return rebootStepStates.some((stepState) => stepState === state);
}


function isStepCompletion(
  _session: ConversationSession,
  intent: UserIntent
): boolean {
  return intent.type === "completion";
}

function getQualificationAnswerForQuestion(
  question: QualificationQuestion,
  intent: UserIntent
): Partial<QualificationAnswers> | null {
  if (intent.type !== "answer") {
    return null;
  }

  return getMappedQualificationAnswer(question, intent.value);
}

function getMappedQualificationAnswer(
  question: QualificationQuestion,
  value: AnswerValue
): Partial<QualificationAnswers> | null {
  if (question.id === "deviceImpact") {
    if (value === deviceImpact.singleDevice) {
      return { deviceImpact: deviceImpact.singleDevice };
    }

    if (value === deviceImpact.multipleDevices) {
      return { deviceImpact: deviceImpact.multipleDevices };
    }

    return null;
  }

  if (question.id === "connectivityScope") {
    if (value === connectivityScope.generalConnectivity) {
      return { connectivityScope: connectivityScope.generalConnectivity };
    }

    if (value === connectivityScope.specificService) {
      return { connectivityScope: connectivityScope.specificService };
    }

    return null;
  }

  const confirmation = asConfirmationAnswer(value);

  if (!confirmation) {
    return null;
  }

  if (question.id === "equipmentStatus") {
    if (confirmation === confirmationAnswer.yes) {
      return { equipmentStatus: equipmentStatus.poweredAndConnected };
    }

    if (confirmation === confirmationAnswer.no) {
      return { equipmentStatus: equipmentStatus.powerOrCableIssue };
    }

    return null;
  }

  if (question.id === "knownOutage") {
    return {
      knownOutage: confirmation === confirmationAnswer.yes
    };
  }

  if (question.id === "canAccessEquipment") {
    if (confirmation === confirmationAnswer.unsure) {
      return null;
    }

    return { canAccessEquipment: confirmation === confirmationAnswer.yes };
  }

  if (question.id === "acceptsTemporaryInterruption") {
    if (confirmation === confirmationAnswer.unsure) {
      return null;
    }

    return {
      acceptsTemporaryInterruption: confirmation === confirmationAnswer.yes
    };
  }

  return null;
}

function getConfirmationAnswer(intent: UserIntent): ConfirmationAnswer | null {
  if (intent.type !== "answer") {
    return null;
  }

  return asConfirmationAnswer(intent.value);
}

function asConfirmationAnswer(value: AnswerValue): ConfirmationAnswer | null {
  if (
    value === confirmationAnswer.yes ||
    value === confirmationAnswer.no ||
    value === confirmationAnswer.unsure
  ) {
    return value;
  }

  return null;
}

function askForIssue(session: ConversationSession): ConversationTurn {
  return {
    session,
    assistantMessage:
      "What WiFi or internet issue are you seeing?"
  };
}
