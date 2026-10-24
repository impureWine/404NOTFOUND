import { z } from 'zod';
import {
  generationSchema,
  requestIdSchema,
  uuidSchema,
} from './common.js';

export const consentPurposeSchema = z.enum(['AI_PROCESS', 'SEARCH_PROCESS', 'SAVE']);
export const consentOperationSchema = z.enum([
  'AGENT_TASK_CREATE',
  'SEARCH_TASK_CREATE',
  'RECORD_CREATE',
  'RECORD_UPDATE',
]);

export const createConsentRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  purpose: consentPurposeSchema,
  sessionId: uuidSchema.optional(),
  activityId: uuidSchema.optional(),
  sessionGeneration: generationSchema.optional(),
  activityGeneration: generationSchema.optional(),
  operation: consentOperationSchema,
  payload: z.record(z.string(), z.unknown()),
});

export const consentResponseSchema = z.strictObject({
  consentId: uuidSchema,
  purpose: consentPurposeSchema,
  expiresAt: z.iso.datetime({ offset: true }),
});

export const revokeConsentRequestSchema = z.strictObject({ requestId: requestIdSchema });
