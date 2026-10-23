import { z } from 'zod';

import { scopeSchema } from './records.js';
import {
  codePointString,
  instantSchema,
  requestIdSchema,
} from './primitives.js';

const encryptedBytesSchema = z.instanceof(Uint8Array);

export const savedQueryRequestSchema = scopeSchema.extend({
  requestId: requestIdSchema,
  searchRequestId: requestIdSchema,
});

const persistedSourceSchema = z.strictObject({
  url: z.string().url().max(2048),
  title: codePointString({ min: 1, max: 512, trim: true, name: 'sourceTitle' }),
  publisher: codePointString({
    min: 1,
    max: 256,
    trim: true,
    name: 'publisher',
  }).nullable().default(null),
  sourceTier: z.enum(['S1', 'S2', 'S3', 'S4', 'SX']),
  quality: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
  publishedAt: instantSchema.nullable().default(null),
  retrievedAt: instantSchema,
  verificationState: z.enum(['VERIFIED', 'PARTIAL', 'UNAVAILABLE']),
  contentFingerprint: encryptedBytesSchema.nullable().default(null),
});

const persistedClaimSchema = z.strictObject({
  claimTextCiphertext: encryptedBytesSchema,
  cipherKeyVersion: z.number().int().positive(),
  status: z.enum(['SUPPORTED', 'CONFLICTED', 'UNKNOWN']),
  evidence: z.array(z.strictObject({
    sourceUrl: z.string().url().max(2048),
    relation: z.enum(['SUPPORTS', 'CONFLICTS', 'CONTEXT']),
  })).min(1).max(10),
});

export const completedSearchResultSchema = scopeSchema.extend({
  searchRequestId: requestIdSchema,
  status: z.enum(['pending', 'running', 'completed', 'cancelled', 'failed', 'expired']),
  searchState: z.enum(['SUCCESS', 'EMPTY']).nullable().default(null),
  rawQueryCiphertext: encryptedBytesSchema,
  normalizedQueryCiphertext: encryptedBytesSchema,
  cipherKeyVersion: z.number().int().positive(),
  partial: z.boolean().default(false),
  hasConflict: z.boolean().default(false),
  uncertaintyNote: codePointString({
    min: 0,
    max: 1000,
    trim: false,
    name: 'uncertaintyNote',
  }).nullable().default(null),
  sources: z.array(persistedSourceSchema).max(10),
  claims: z.array(persistedClaimSchema).max(10),
});

export const searchInputSchema = z.strictObject({
  question: codePointString({ min: 1, max: 4000, trim: true, name: 'question' }),
  limit: z.number().int().min(1).max(10).default(5),
});
