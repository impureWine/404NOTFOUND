import { z } from 'zod';

import { scopeSchema } from './records.js';

const encryptedBytesSchema = z.instanceof(Uint8Array);

export const savedQuerySchema = scopeSchema.extend({
  requestId: z.string().trim().min(1).max(128),
  searchRequestId: z.string().trim().min(1).max(128),
  rawQueryCiphertext: encryptedBytesSchema,
  normalizedQueryCiphertext: encryptedBytesSchema,
  cipherKeyVersion: z.number().int().positive(),
  partial: z.boolean().default(false),
  hasConflict: z.boolean().default(false),
  uncertaintyNote: z.string().max(1000).nullable().default(null),
  sources: z.array(z.strictObject({
    url: z.string().url().max(2048),
    title: z.string().trim().min(1).max(512),
    publisher: z.string().trim().min(1).max(256).nullable().default(null),
    sourceTier: z.enum(['S1', 'S2', 'S3', 'S4', 'SX']),
    quality: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
    publishedAt: z.string().datetime({ offset: true }).nullable().default(null),
    retrievedAt: z.string().datetime({ offset: true }),
    verificationState: z.enum(['VERIFIED', 'PARTIAL', 'UNAVAILABLE']),
    contentFingerprint: encryptedBytesSchema.nullable().default(null),
  })).min(1).max(20),
  claims: z.array(z.strictObject({
    claimTextCiphertext: encryptedBytesSchema,
    cipherKeyVersion: z.number().int().positive(),
    status: z.enum(['SUPPORTED', 'CONFLICTED', 'UNKNOWN']),
    evidence: z.array(z.strictObject({
      sourceUrl: z.string().url().max(2048),
      relation: z.enum(['SUPPORTS', 'CONFLICTS', 'CONTEXT']),
    })).min(1).max(20),
  })).min(1).max(50),
});

export const searchInputSchema = z.strictObject({
  question: z.string().trim().min(1).max(4000),
  limit: z.number().int().min(1).max(10).default(5),
});
