import { z } from 'zod';
import {
  positiveVersionSchema,
  requestIdSchema,
  textByCodePoints,
  uuidSchema,
} from './common.js';

export const recordKindSchema = z.enum([
  'CONVERSATION',
  'EMOTION',
  'WORRY_OBJECT',
  'REHEARSAL_DRAFT',
  'DEPOSIT',
]);

export const recordContentSchema = z.strictObject({
  title: textByCodePoints({ min: 1, max: 80, label: '标题', trim: true }),
  body: textByCodePoints({ min: 1, max: 4000, label: '正文' }),
});

export const createRecordRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  consentId: uuidSchema,
  kind: recordKindSchema,
  content: recordContentSchema,
});

export const updateRecordRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  consentId: uuidSchema,
  expectedVersion: positiveVersionSchema,
  content: recordContentSchema,
});

export const listRecordsQuerySchema = z.strictObject({
  kind: recordKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});

export const clearConfirmationRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  expectedVersion: positiveVersionSchema,
});
export const clearRecordRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  expectedVersion: positiveVersionSchema,
  confirmationId: uuidSchema,
});
