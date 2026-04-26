import { rebootMethod, rebootMethodValues } from "./constants";

export type RebootMethod = (typeof rebootMethodValues)[number];

export type RebootStep = {
  id: string;
  method: RebootMethod;
  instruction: string;
  confirmationPrompt: string;
  estimatedWait?: string;
  requiredWaitSeconds?: number;
};

export const rebootSteps: RebootStep[] = [
  {
    id: "disconnect-router-and-modem-power",
    method: rebootMethod.powerCycle,
    instruction:
      "Disconnect the power cord from both the router and the modem.",
    confirmationPrompt: "Reply done when both power cords are disconnected."
  },
  {
    id: "wait-ten-seconds",
    method: rebootMethod.powerCycle,
    instruction: "Wait 10 seconds.",
    confirmationPrompt: "Reply done after waiting 10 seconds.",
    estimatedWait: "10 seconds",
    requiredWaitSeconds: 10
  },
  {
    id: "reconnect-modem-power",
    method: rebootMethod.powerCycle,
    instruction: "Reconnect the modem power cord and make sure it has power.",
    confirmationPrompt: "Reply done when the modem power cord is reconnected."
  },
  {
    id: "wait-for-modem-online",
    method: rebootMethod.powerCycle,
    instruction:
      "Wait until the modem online indicator stops blinking. This usually takes about two minutes.",
    confirmationPrompt:
      "Reply done when the modem online indicator has stopped blinking.",
    estimatedWait: "about two minutes",
    requiredWaitSeconds: 120
  },
  {
    id: "reconnect-router-power",
    method: rebootMethod.powerCycle,
    instruction: "Reconnect the router power cord.",
    confirmationPrompt: "Reply done when the router power cord is reconnected."
  },
  {
    id: "wait-for-router-and-test",
    method: rebootMethod.powerCycle,
    instruction:
      "Wait until the router power indicator stops blinking, then wait two more minutes before trying to connect to the internet.",
    confirmationPrompt:
      "Reply done after the router power indicator stops blinking and you have waited two more minutes.",
    estimatedWait: "about two minutes after the router power indicator stops blinking",
    requiredWaitSeconds: 120
  }
];

export const linksysSmartWifiRebootSteps: RebootStep[] = [
  {
    id: "log-in-to-linksys-smart-wifi",
    method: rebootMethod.linksysSmartWifi,
    instruction: "Log in to Linksys Smart Wi-Fi.",
    confirmationPrompt: "Continue after signing in."
  },
  {
    id: "open-troubleshooting",
    method: rebootMethod.linksysSmartWifi,
    instruction: "Under Router Settings, click Troubleshooting.",
    confirmationPrompt: "Continue after opening Troubleshooting."
  },
  {
    id: "open-diagnostics",
    method: rebootMethod.linksysSmartWifi,
    instruction: "Click the Diagnostics tab.",
    confirmationPrompt: "Continue after opening Diagnostics."
  },
  {
    id: "click-reboot",
    method: rebootMethod.linksysSmartWifi,
    instruction: "Under Reboot, click Reboot.",
    confirmationPrompt: "Continue after clicking Reboot."
  },
  {
    id: "confirm-reboot",
    method: rebootMethod.linksysSmartWifi,
    instruction: "Click Yes to confirm the reboot.",
    confirmationPrompt: "Continue after confirming the reboot."
  }
];

export function formatRebootStep(stepIndex: number): string {
  const step = rebootSteps[stepIndex];

  if (!step) {
    throw new RangeError(`No reboot step exists for index ${stepIndex}.`);
  }

  return [
    `Step ${stepIndex + 1} of ${rebootSteps.length}: ${step.instruction}`,
    step.confirmationPrompt
  ].join("\n\n");
}
