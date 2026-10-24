import { z } from 'zod';
import { responseMetaSchema } from './common.js';

export const errorCodeSchema = z.enum([
  'INVALID_INPUT',
  'AUTH_REQUIRED',
  'ACCESS_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
]);

export const fieldErrorSchema = z.strictObject({
  path: z.string(),
  rule: z.string(),
});

export const errorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string().min(1).max(200),
    fields: z.array(fieldErrorSchema).optional(),
    retryAfterSeconds: z.int().positive().optional(),
  }),
  meta: responseMetaSchema,
});
