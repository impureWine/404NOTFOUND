import { z } from 'zod';

import {
  codePointString,
  ianaTimeZoneSchema,
  instantSchema,
  isoDateSchema,
  nonZeroUuidSchema,
  requestIdSchema,
} from './primitives.js';

export const recordKinds = [
  'CONVERSATION',
  'EMOTION',
  'WORRY_OBJECT',
  'REHEARSAL_DRAFT',
  'DEPOSIT',
  'QUERY',
];

export const scopeSchema = z.strictObject({
  accountId: nonZeroUuidSchema,
  entryPointId: nonZeroUuidSchema,
});

const encryptedBytesSchema = z.instanceof(Uint8Array);

const conversationDetailsSchema = z.strictObject({
  messages: z.array(z.strictObject({
    role: z.enum(['USER', 'ASSISTANT']),
    contentCiphertext: encryptedBytesSchema,
    cipherKeyVersion: z.number().int().positive(),
  })).min(1).max(20),
});

const emotionDetailsSchema = z.strictObject({
  recordDate: isoDateSchema,
  emotionCodes: z.array(codePointString({
    min: 1,
    max: 20,
    trim: true,
    name: 'emotionWord',
  })).min(1).max(5),
  intensity: z.number().int().min(1).max(5),
  timezoneName: ianaTimeZoneSchema,
  eventCiphertext: encryptedBytesSchema.nullable().default(null),
  cipherKeyVersion: z.number().int().positive().nullable().default(null),
}).superRefine((value, context) => {
  if (new Set(value.emotionCodes).size !== value.emotionCodes.length) {
    context.addIssue({ code: 'custom', message: 'emotionCodes must be unique' });
  }
  if ((value.eventCiphertext === null) !== (value.cipherKeyVersion === null)) {
    context.addIssue({
      code: 'custom',
      message: 'eventCiphertext and cipherKeyVersion must be provided together',
    });
  }
});

const worryObjectDetailsSchema = z.strictObject({
  shapeCode: z.enum(['TANGLE', 'STONE', 'NOTE']),
  bodyCiphertext: encryptedBytesSchema.nullable().default(null),
  cipherKeyVersion: z.number().int().positive().nullable().default(null),
}).superRefine((value, context) => {
  if ((value.bodyCiphertext === null) !== (value.cipherKeyVersion === null)) {
    context.addIssue({
      code: 'custom',
      message: 'bodyCiphertext and cipherKeyVersion must be provided together',
    });
  }
});

const rehearsalDraftDetailsSchema = z.strictObject({
  sceneCiphertext: encryptedBytesSchema,
  expressionsCiphertext: encryptedBytesSchema,
  expressionCount: z.number().int().min(1).max(20),
  cipherKeyVersion: z.number().int().positive(),
});

const depositDetailsSchema = z.strictObject({
  bodyCiphertext: encryptedBytesSchema,
  cipherKeyVersion: z.number().int().positive(),
  reopenAt: instantSchema,
});

export const editableRecordDetailsSchemas = Object.freeze({
  EMOTION: emotionDetailsSchema,
  WORRY_OBJECT: worryObjectDetailsSchema,
  REHEARSAL_DRAFT: rehearsalDraftDetailsSchema,
});

const recordCreateBaseSchema = scopeSchema.extend({
  requestId: requestIdSchema,
  titleCiphertext: encryptedBytesSchema.nullable().default(null),
  titleKeyVersion: z.number().int().positive().nullable().default(null),
});

export const recordCreateSchema = z.discriminatedUnion('kind', [
  recordCreateBaseSchema.extend({
    kind: z.literal('CONVERSATION'),
    details: conversationDetailsSchema,
  }),
  recordCreateBaseSchema.extend({
    kind: z.literal('EMOTION'),
    details: emotionDetailsSchema,
  }),
  recordCreateBaseSchema.extend({
    kind: z.literal('WORRY_OBJECT'),
    details: worryObjectDetailsSchema,
  }),
  recordCreateBaseSchema.extend({
    kind: z.literal('REHEARSAL_DRAFT'),
    details: rehearsalDraftDetailsSchema,
  }),
  recordCreateBaseSchema.extend({
    kind: z.literal('DEPOSIT'),
    details: depositDetailsSchema,
  }),
]).superRefine((value, context) => {
  if ((value.titleCiphertext === null) !== (value.titleKeyVersion === null)) {
    context.addIssue({
      code: 'custom',
      message: 'titleCiphertext and titleKeyVersion must be provided together',
    });
  }
});

export const recordListSchema = scopeSchema.extend({
  kind: z.enum(recordKinds).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(2048).optional(),
});

export const recordIdentitySchema = scopeSchema.extend({
  recordId: nonZeroUuidSchema,
});

export const recordUpdateSchema = recordIdentitySchema.extend({
  requestId: requestIdSchema,
  expectedVersion: z.number().int().positive(),
  titleCiphertext: encryptedBytesSchema.nullable().default(null),
  titleKeyVersion: z.number().int().positive().nullable().default(null),
  details: z.unknown(),
}).superRefine((value, context) => {
  if ((value.titleCiphertext === null) !== (value.titleKeyVersion === null)) {
    context.addIssue({
      code: 'custom',
      message: 'titleCiphertext and titleKeyVersion must be provided together',
    });
  }
});

export const recordClearConfirmationSchema = recordIdentitySchema.extend({
  requestId: requestIdSchema,
  expectedVersion: z.number().int().positive(),
});

export const recordClearSchema = recordClearConfirmationSchema.extend({
  confirmationId: nonZeroUuidSchema,
  confirmed: z.literal(true),
});

export const depositActionSchema = recordIdentitySchema.extend({
  requestId: requestIdSchema,
  expectedVersion: z.number().int().positive(),
});

export const depositPostponeSchema = depositActionSchema.extend({
  reopenAt: instantSchema,
});
