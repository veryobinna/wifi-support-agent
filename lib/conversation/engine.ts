import { conversationState } from "./constants";
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
import { hasAny, normalizeInput } from "./text";

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

  if (session.state === conversationState.start) {
    return startQualification(session, userInput);
  }

  if (session.state === conversationState.qualifying) {
    return continueQualification(session, userInput);
  }

  if (session.state === conversationState.rebootIntro) {
    return startRebootWhenReady(session, userInput);
  }

  if (isRebootStepState(session.state)) {
    return continueRebootSteps(session, userInput);
  }

  if (session.state === conversationState.checkResolution) {
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
    state: conversationState.qualifying,
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
    if (classifyUserIntent(userInput) === "question") {
      return askQualificationQuestion(
        session,
        question,
        `${answerQualificationQuestion(question)}\n\n${question.prompt}`
      );
    }

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
        state: conversationState.notAppropriateExit,
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
  userInput: string
): ConversationTurn {
  const answer = parseYesNo(userInput);
  const intent = classifyUserIntent(userInput);

  if (answer === false) {
    return {
      session: {
        ...session,
        state: conversationState.notAppropriateExit
      },
      assistantMessage:
        "No problem. Rebooting can briefly interrupt internet access, so stop here and come back when it is safe and convenient."
    };
  }

  if (intent === "question") {
    return {
      session,
      assistantMessage:
        "A reboot turns the modem and router off and back on. It is not a factory reset, and you should not press or hold the Reset button. Are you ready to begin the power-cord reboot steps?"
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
  if (!isStepCompletion(session, userInput)) {
    if (classifyUserIntent(userInput) === "question") {
      return {
        session,
        assistantMessage: `${answerRebootStepQuestion(session)}\n\n${formatRebootStep(session.rebootStepIndex)}`
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
  userInput: string
): ConversationTurn {
  const answer = parseYesNo(userInput);

  if (answer === true) {
    return {
      session: {
        ...session,
        state: conversationState.resolvedExit
      },
      assistantMessage:
        "Good. The reboot appears to have resolved the issue, so you are all set."
    };
  }

  if (answer === false) {
    return {
      session: {
        ...session,
        state: conversationState.unresolvedExit
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
  const intent = classifyUserIntent(input);

  return intent === "completion" || intent === "yes";
}

type UserIntent = "question" | "completion" | "yes" | "no" | "unsure" | "unknown";

function classifyUserIntent(input: string): UserIntent {
  const answer = parseYesNo(input);

  if (answer === true) {
    return "yes";
  }

  if (answer === false) {
    return "no";
  }

  const normalized = normalizeInput(input);

  if (
    hasAny(normalized, [
      "not sure",
      "unsure",
      "unknown",
      "i don't know",
      "i dont know",
      "maybe"
    ])
  ) {
    return "unsure";
  }

  if (isQuestionLike(input, normalized)) {
    return "question";
  }

  if (
    hasAny(normalized, [
      "done",
      "finished",
      "complete",
      "completed",
      "next",
      "continue"
    ])
  ) {
    return "completion";
  }

  return "unknown";
}

function isQuestionLike(rawInput: string, normalizedInput: string): boolean {
  return (
    rawInput.includes("?") ||
    hasAny(normalizedInput, [
      "what",
      "why",
      "how",
      "where",
      "when",
      "can i",
      "can we",
      "should i",
      "should we",
      "do i",
      "do we",
      "does this",
      "will this",
      "is this"
    ])
  );
}

function answerQualificationQuestion(question: QualificationQuestion): string {
  if (question.id === "knownOutage") {
    return "You can check your ISP's outage page, mobile app, support line, or service-status messages. If you do not know, answer \"not sure.\"";
  }

  if (question.id === "deviceImpact") {
    return "This tells us whether the problem is likely one device or something shared like the router or internet connection.";
  }

  if (question.id === "connectivityScope") {
    return "This helps separate a general connection problem from an issue with only one app or website.";
  }

  if (question.id === "equipmentStatus") {
    return "A reboot should wait until the modem and router have power and their cables are firmly connected.";
  }

  if (question.id === "canAccessEquipment") {
    return "Only continue if you can safely reach the router and modem power cords.";
  }

  return "The reboot will briefly disconnect the internet, so I need to confirm whether now is a safe time.";
}

function answerRebootStepQuestion(session: ConversationSession): string {
  const step = rebootSteps[session.rebootStepIndex];

  if (!step) {
    return "I can clarify the current reboot step.";
  }

  if (step.estimatedWait) {
    return `For this step, wait ${step.estimatedWait}.`;
  }

  return "Follow the current power-cord reboot step as written. Do not press or hold the Reset button.";
}

function isStepCompletion(
  session: ConversationSession,
  userInput: string
): boolean {
  if (isProgressConfirmation(userInput)) {
    return true;
  }

  const step = rebootSteps[session.rebootStepIndex];
  const normalized = normalizeInput(userInput);

  if (!step) {
    return false;
  }

  if (step.id === "disconnect-router-and-modem-power") {
    return hasAny(normalized, [
      "disconnected",
      "unplugged",
      "both power cords",
      "power cords are disconnected",
      "power is disconnected"
    ]);
  }

  if (step.id === "wait-ten-seconds") {
    return hasWaitedAtLeast(userInput, 10);
  }

  if (step.id === "reconnect-modem-power") {
    return hasAny(normalized, [
      "reconnected modem",
      "connected modem",
      "plugged modem",
      "modem power cord",
      "modem has power",
      "modem is powered"
    ]);
  }

  if (step.id === "wait-for-modem-online") {
    return (
      hasWaitedAtLeast(userInput, 120) ||
      hasAny(normalized, [
        "online indicator stopped",
        "online light stopped",
        "stopped blinking",
        "solid",
        "modem is online"
      ])
    );
  }

  if (step.id === "reconnect-router-power") {
    return hasAny(normalized, [
      "reconnected router",
      "connected router",
      "plugged router",
      "router power cord",
      "router has power",
      "router is powered"
    ]);
  }

  return (
    hasWaitedAtLeast(userInput, 120) ||
    hasAny(normalized, [
      "router power indicator stopped",
      "power indicator stopped",
      "stopped blinking",
      "waited two more minutes",
      "tried connecting",
      "tested internet",
      "tested the internet"
    ])
  );
}

function hasWaitedAtLeast(input: string, minimumSeconds: number): boolean {
  const normalized = normalizeInput(input);

  if (
    !hasAny(normalized, [
      "waited",
      "i waited",
      "have waited",
      "finished waiting",
      "done waiting"
    ])
  ) {
    return false;
  }

  const seconds = extractDurationSeconds(normalized);

  if (seconds === null) {
    return true;
  }

  return seconds >= minimumSeconds;
}

function extractDurationSeconds(normalizedInput: string): number | null {
  const match = normalizedInput.match(
    /(\d+)\s*(second|seconds|sec|secs|minute|minutes|min|mins)?/
  );

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);

  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = match[2];

  if (unit && unit.startsWith("min")) {
    return amount * 60;
  }

  return amount;
}
