import { z } from "zod";
import {
  chatRoles,
  connectivityScopeValues,
  conversationStates,
  deviceImpactValues,
  equipmentStatusValues,
  qualificationQuestionIds
} from "@/lib/conversation/constants";

const chatRoleSchema = z.enum(chatRoles);
const conversationStateSchema = z.enum(conversationStates);
const qualificationQuestionIdSchema = z.enum(qualificationQuestionIds);

const qualificationAnswersSchema = z
  .object({
    deviceImpact: z.enum(deviceImpactValues).optional(),
    connectivityScope: z.enum(connectivityScopeValues).optional(),
    equipmentStatus: z.enum(equipmentStatusValues).optional(),
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
