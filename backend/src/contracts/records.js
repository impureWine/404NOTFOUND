import { z } from 'zod';

export const recordKinds = [
  'CONVERSATION',
  'EMOTION',
  'WORRY_OBJECT',
  'REHEARSAL_DRAFT',
  'DEPOSIT',
  'QUERY',
];

export const scopeSchema = z.strictObject({
  accountId: z.string().uuid(),
  entryPointId: z.string().uuid(),
});

const encryptedBytesSchema = z.instanceof(Uint8Array);

const recordCreateBaseSchema = scopeSchema.extend({
  requestId: z.string().trim().min(1).max(128),
  titleCiphertext: encryptedBytesSchema.nullable().default(null),
  titleKeyVersion: z.number().int().positive().nullable().default(null),
});

export const recordCreateSchema = z.discriminatedUnion('kind', [
  recordCreateBaseSchema.extend({
    kind: z.literal('CONVERSATION'),
    details: z.strictObject({
      messages: z.array(z.strictObject({
        role: z.enum(['USER', 'ASSISTANT']),
        contentCiphertext: encryptedBytesSchema,
        cipherKeyVersion: z.number().int().positive(),
      })).min(1).max(20),
    }),
  }),
  recordCreateBaseSchema.extend({
    kind: z.literal('EMOTION'),
    details: z.strictObject({
      recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      emotionCodes: z.array(z.string().trim().min(1).max(20)).min(1).max(5),
      intensity: z.number().int().min(1).max(5),
      timezoneName: z.string().trim().min(1).max(64),
      eventCiphertext: encryptedBytesSchema.nullable().default(null),
      cipherKeyVersion: z.number().int().positive().nullable().default(null),
    }),
  }),
  recordCreateBaseSchema.extend({
    kind: z.literal('WORRY_OBJECT'),
    details: z.strictObject({
      shapeCode: z.enum(['TANGLE', 'STONE', 'NOTE']),
      bodyCiphertext: encryptedBytesSchema.nullable().default(null),
      cipherKeyVersion: z.number().int().positive().nullable().default(null),
    }),
  }),
  recordCreateBaseSchema.extend({
    kind: z.literal('REHEARSAL_DRAFT'),
    details: z.strictObject({
      sceneCiphertext: encryptedBytesSchema,
      expressionsCiphertext: encryptedBytesSchema,
      expressionCount: z.number().int().min(1).max(20),
      cipherKeyVersion: z.number().int().positive(),
    }),
  }),
  recordCreateBaseSchema.extend({
    kind: z.literal('DEPOSIT'),
    details: z.strictObject({
      bodyCiphertext: encryptedBytesSchema,
      cipherKeyVersion: z.number().int().positive(),
      reopenAt: z.string().datetime({ offset: true }),
    }),
  }),
]).superRefine((value, context) => {
  if ((value.titleCiphertext === null) !== (value.titleKeyVersion === null)) {
    context.addIssue({
      code: 'custom',
      message: 'titleCiphertext and titleKeyVersion must be provided together',
    });
  }

  if (value.kind === 'EMOTION') {
    const uniqueCodes = new Set(value.details.emotionCodes);
    if (uniqueCodes.size !== value.details.emotionCodes.length) {
      context.addIssue({ code: 'custom', message: 'emotionCodes must be unique' });
    }
    if ((value.details.eventCiphertext === null) !== (value.details.cipherKeyVersion === null)) {
      context.addIssue({
        code: 'custom',
        message: 'eventCiphertext and cipherKeyVersion must be provided together',
      });
    }
  }

  if (
    value.kind === 'WORRY_OBJECT'
    && (value.details.bodyCiphertext === null) !== (value.details.cipherKeyVersion === null)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'bodyCiphertext and cipherKeyVersion must be provided together',
    });
  }
});

export const recordListSchema = scopeSchema.extend({
  kind: z.enum(recordKinds).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const recordIdentitySchema = scopeSchema.extend({
  recordId: z.string().uuid(),
});

export const recordClearSchema = recordIdentitySchema.extend({
  requestId: z.string().trim().min(1).max(128),
  expectedVersion: z.number().int().positive(),
});

export const depositActionSchema = recordClearSchema;

export const depositPostponeSchema = recordClearSchema.extend({
  reopenAt: z.string().datetime({ offset: true }),
});
