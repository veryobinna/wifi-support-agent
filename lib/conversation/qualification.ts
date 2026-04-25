export type QualificationStatus = "appropriate" | "not_appropriate" | "unknown";

export type QualificationDecision = {
  status: QualificationStatus;
  reason: string;
};

export function decideRebootAppropriateness(): QualificationDecision {
  return {
    status: "unknown",
    reason: "Qualification logic has not been implemented yet."
  };
}
