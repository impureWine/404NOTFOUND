import { z } from 'zod';
import {
  positiveVersionSchema,
  requestIdSchema,
  textByCodePoints,
  uuidSchema,
} from './common.js';

export const recordKindSchema = z.enum([
  'QUERY',
  'CONVERSATION',
  'EMOTION',
  'WORRY_OBJECT',
  'REHEARSAL_DRAFT',
  'DEPOSIT',
]);

const titleSchema = textByCodePoints({ min: 1, max: 80, label: '标题', trim: true });
export const recordDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, '日期无效');
export const emotionContentSchema = z.strictObject({
  title: titleSchema,
  recordDate: recordDateSchema,
  emotionCodes: z.array(textByCodePoints({ min: 1, max: 20, trim: true })).max(5)
    .refine(items => new Set(items).size === items.length, '情绪词不能重复'),
  intensity: z.int().min(1).max(5).nullable(),
  timezoneName: z.string().max(64).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, '时区无效'),
  note: textByCodePoints({ max: 300, label: '备注' }),
});
export const worryContentSchema = z.strictObject({ title: titleSchema, shapeCode: z.enum(['TANGLE', 'STONE', 'NOTE']), body: textByCodePoints({ min: 1, max: 4000 }) });
export const rehearsalContentSchema = z.strictObject({ title: titleSchema, scene: textByCodePoints({ min: 1, max: 4000 }), expressions: z.array(textByCodePoints({ min: 1, max: 4000 })).min(1).max(20) });
export const depositContentSchema = z.strictObject({ title: titleSchema, body: textByCodePoints({ min: 1, max: 4000 }), reopenAt: z.iso.datetime({ offset: true }) });
export const depositRequestSchema = z.strictObject({ requestId: requestIdSchema, expectedVersion: positiveVersionSchema });
export const postponeDepositRequestSchema = depositRequestSchema.extend({ reopenAt: z.iso.datetime({ offset: true }) });
export const recordContentSchema = z.union([
  z.strictObject({ title: titleSchema, body: textByCodePoints({ min: 1, max: 4000, label: '正文' }) }),
  z.strictObject({ title: titleSchema, messages: z.array(z.strictObject({
    role: z.enum(['USER', 'ASSISTANT']),
    content: textByCodePoints({ min: 1, max: 4000, label: '消息', trim: true }),
  })).min(1).max(20) }),
  emotionContentSchema,
  worryContentSchema,
  rehearsalContentSchema,
  depositContentSchema,
]);

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
  from: recordDateSchema.optional(),
  to: recordDateSchema.optional(),
  cursor: z.string().min(1).max(2048).optional(),
}).refine(value => (!value.from && !value.to) || (value.kind === 'EMOTION' && value.from && value.to && value.from <= value.to), '日期范围仅适用于情绪记录，且起止日期必须完整有效');

export const clearConfirmationRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  expectedVersion: positiveVersionSchema,
});
export const clearRecordRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  expectedVersion: positiveVersionSchema,
  confirmationId: uuidSchema,
});

export const saveQueryRequestSchema = z.strictObject({ requestId: requestIdSchema, consentId: uuidSchema, searchRequestId: uuidSchema });
