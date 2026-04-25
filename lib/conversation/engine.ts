import { rebootSteps, formatRebootStep } from "./rebootSteps";
import {
  createInitialConversationSession,
  rebootStepStates,
  type ConversationSession,
  type ConversationState
} from "./state";
import {
  decideRebootAppropriateness,
  getNextQualificationQuestion,
  getQualificationQuestion,
  inferAnswerForQuestion,
  inferIssueOverview,
  parseYesNo,
  type QualificationDecision,
  type QualificationQuestion
} from "./qualification";

export type ConversationTurn = {
  session: ConversationSession;
  assistantMessage: string;
  decision?: QualificationDecision;
};

const terminalStates = new Set<ConversationState>([
  "NOT_APPROPRIATE_EXIT",
  "RESOLVED_EXIT",
  "UNRESOLVED_EXIT"
]);

export function advanceConversation(
  session: ConversationSession = createInitialConversationSession(),
  userInput: string
): ConversationTurn {
  if (terminalStates.has(session.state)) {
    return {
      session,
      assistantMessage:
        "This support conversation has ended. Start a new chat if you need to troubleshoot another issue."
    };
  }

  if (session.state === "START") {
    return startQualification(session, userInput);
  }

  if (session.state === "QUALIFYING") {
    return continueQualification(session, userInput);
  }

  if (session.state === "REBOOT_INTRO") {
    return startRebootWhenReady(session, userInput);
  }

  if (isRebootStepState(session.state)) {
    return continueRebootSteps(session, userInput);
  }

  if (session.state === "CHECK_RESOLUTION") {
    return checkResolution(session, userInput);
  }

  return startQualification(session, userInput);
}

function startQualification(
  session: ConversationSession,
  userInput: string
): ConversationTurn {
  const nextSession = {
    ...session,
    state: "QUALIFYING" as const,
    qualification: {
      ...session.qualification,
      ...inferIssueOverview(userInput)
    }
  };

  return routeAfterQualificationUpdate(nextSession);
}

function continueQualification(
  session: ConversationSession,
  userInput: string
): ConversationTurn {
  const question = session.currentQuestionId
    ? getQualificationQuestion(session.currentQuestionId)
    : getNextQualificationQuestion(session.qualification);

  if (!question) {
    return routeAfterQualificationUpdate(session);
  }

  const inferredAnswer = inferAnswerForQuestion(question.id, userInput);

  if (!inferredAnswer) {
    return askQualificationQuestion(session, question, question.retryPrompt);
  }

  return routeAfterQualificationUpdate({
    ...session,
    qualification: {
      ...session.qualification,
      ...inferredAnswer
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
        state: "NOT_APPROPRIATE_EXIT",
        currentQuestionId: null
      },
      assistantMessage: `${decision.reason} I recommend stopping here for this reboot flow and trying the more relevant next step first.`,
      decision
    };
  }

  if (decision.status === "appropriate") {
    return {
      session: {
        ...session,
        state: "REBOOT_INTRO",
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
      state: "QUALIFYING",
      currentQuestionId: question.id
    },
    assistantMessage: prompt
  };
}

function startRebootWhenReady(
  session: ConversationSession,
  userInput: string
): ConversationTurn {
  const answer = parseYesNo(userInput);

  if (answer === false) {
    return {
      session: {
        ...session,
        state: "NOT_APPROPRIATE_EXIT"
      },
      assistantMessage:
        "No problem. Rebooting can briefly interrupt internet access, so stop here and come back when it is safe and convenient."
    };
  }

  if (answer !== true && !isProgressConfirmation(userInput)) {
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
  userInput: string
): ConversationTurn {
  if (!isProgressConfirmation(userInput)) {
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
        state: "CHECK_RESOLUTION",
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
  userInput: string
): ConversationTurn {
  const answer = parseYesNo(userInput);

  if (answer === true) {
    return {
      session: {
        ...session,
        state: "RESOLVED_EXIT"
      },
      assistantMessage:
        "Good. The reboot appears to have resolved the issue, so you are all set."
    };
  }

  if (answer === false) {
    return {
      session: {
        ...session,
        state: "UNRESOLVED_EXIT"
      },
      assistantMessage:
        "I am sorry the reboot did not resolve it. The next best step is to contact your internet service provider or Linksys support, especially if multiple devices are still affected."
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

function isProgressConfirmation(input: string): boolean {
  const normalized = input.toLowerCase();

  return [
    "done",
    "finished",
    "complete",
    "completed",
    "next",
    "ready",
    "continue",
    "ok",
    "okay",
    "yes"
  ].some((phrase) => normalized.includes(phrase));
}
