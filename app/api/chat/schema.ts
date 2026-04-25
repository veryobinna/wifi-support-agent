import { z } from "zod";
import { qualificationQuestionIds } from "@/lib/conversation/qualification";
import { conversationStates } from "@/lib/conversation/state";

const chatRoleSchema = z.enum(["assistant", "user"]);

const conversationStateSchema = z.enum(conversationStates);

const qualificationQuestionIdSchema = z.enum(qualificationQuestionIds);

const qualificationAnswersSchema = z
  .object({
    deviceImpact: z.enum(["single_device", "multiple_devices"]).optional(),
    connectivityScope: z
      .enum(["general_connectivity", "specific_service"])
      .optional(),
    equipmentStatus: z
      .enum(["powered_and_connected", "power_or_cable_issue"])
      .optional(),
    knownOutage: z.boolean().optional(),
    canAccessEquipment: z.boolean().optional(),
    acceptsTemporaryInterruption: z.boolean().optional()
  })
  .strict();

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: chatRoleSchema,
  content: z.string()
}).strict();

export const conversationSessionSchema = z.object({
  state: conversationStateSchema,
  qualification: qualificationAnswersSchema,
  currentQuestionId: qualificationQuestionIdSchema.nullable(),
  rebootStepIndex: z.number().int().nonnegative()
}).strict();

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  state: conversationStateSchema.optional(),
  session: conversationSessionSchema.optional()
}).strict();
