export const chatRole = {
  assistant: "assistant",
  user: "user"
} as const;

export const chatRoles = [chatRole.assistant, chatRole.user] as const;

export const rebootStepStates = [
  "REBOOT_STEP_1",
  "REBOOT_STEP_2",
  "REBOOT_STEP_3",
  "REBOOT_STEP_4",
  "REBOOT_STEP_5",
  "REBOOT_STEP_6"
] as const;

export const conversationState = {
  start: "START",
  qualifying: "QUALIFYING",
  notAppropriateExit: "NOT_APPROPRIATE_EXIT",
  rebootIntro: "REBOOT_INTRO",
  checkResolution: "CHECK_RESOLUTION",
  resolvedExit: "RESOLVED_EXIT",
  unresolvedExit: "UNRESOLVED_EXIT"
} as const;

export const conversationStates = [
  conversationState.start,
  conversationState.qualifying,
  conversationState.notAppropriateExit,
  conversationState.rebootIntro,
  ...rebootStepStates,
  conversationState.checkResolution,
  conversationState.resolvedExit,
  conversationState.unresolvedExit
] as const;

export const confirmationAnswer = {
  yes: "yes",
  no: "no",
  unsure: "unsure"
} as const;

export const confirmationAnswerValues = [
  confirmationAnswer.yes,
  confirmationAnswer.no,
  confirmationAnswer.unsure
] as const;

export const deviceImpact = {
  singleDevice: "single_device",
  multipleDevices: "multiple_devices"
} as const;

export const deviceImpactValues = [
  deviceImpact.singleDevice,
  deviceImpact.multipleDevices
] as const;

export const connectivityScope = {
  generalConnectivity: "general_connectivity",
  specificService: "specific_service"
} as const;

export const connectivityScopeValues = [
  connectivityScope.generalConnectivity,
  connectivityScope.specificService
] as const;

export const equipmentStatus = {
  poweredAndConnected: "powered_and_connected",
  powerOrCableIssue: "power_or_cable_issue"
} as const;

export const equipmentStatusValues = [
  equipmentStatus.poweredAndConnected,
  equipmentStatus.powerOrCableIssue
] as const;

export const qualificationStatus = {
  appropriate: "appropriate",
  notAppropriate: "not_appropriate",
  unknown: "unknown"
} as const;

export const qualificationStatusValues = [
  qualificationStatus.appropriate,
  qualificationStatus.notAppropriate,
  qualificationStatus.unknown
] as const;

export const qualificationQuestionIds = [
  "deviceImpact",
  "connectivityScope",
  "equipmentStatus",
  "knownOutage",
  "canAccessEquipment",
  "acceptsTemporaryInterruption"
] as const;

export const rebootMethod = {
  powerCycle: "power_cycle",
  linksysSmartWifi: "linksys_smart_wifi"
} as const;

export const rebootMethodValues = [
  rebootMethod.powerCycle,
  rebootMethod.linksysSmartWifi
] as const;
