import { z } from 'zod';

import {
  codePointString,
  ianaTimeZoneSchema,
  instantSchema,
  nonZeroUuidSchema,
} from './primitives.js';

const digest32Schema = z.instanceof(Uint8Array).refine(
  (value) => value.byteLength === 32,
  'digest must be exactly 32 bytes',
);

export const createAccountSchema = z.strictObject({
  loginIdentifier: z.string().min(1).max(128),
  passwordDigest: z.string().min(1).max(255),
  passwordParameters: z.record(z.string(), z.unknown()),
  nickname: codePointString({ min: 1, max: 32, trim: true, name: 'nickname' }),
  avatarKey: z.string().trim().min(1).max(64),
  timezoneName: ianaTimeZoneSchema.default('Asia/Shanghai'),
});

export const createSessionSchema = z.strictObject({
  accountId: nonZeroUuidSchema,
  entryPointId: nonZeroUuidSchema,
  tokenDigest: digest32Schema,
  deviceId: z.string().max(128).nullable().default(null),
  expiresAt: instantSchema,
});

export const sessionLookupSchema = z.strictObject({
  tokenDigest: digest32Schema,
});

export const updateProfileSchema = z.strictObject({
  accountId: nonZeroUuidSchema,
  expectedVersion: z.number().int().positive(),
  nickname: codePointString({ min: 1, max: 32, trim: true, name: 'nickname' }),
  avatarKey: z.string().trim().min(1).max(64),
  bioCiphertext: z.instanceof(Uint8Array).nullable().default(null),
  cipherKeyVersion: z.number().int().positive().nullable().default(null),
}).superRefine((value, context) => {
  if ((value.bioCiphertext === null) !== (value.cipherKeyVersion === null)) {
    context.addIssue({
      code: 'custom',
      message: 'bioCiphertext and cipherKeyVersion must be provided together',
    });
  }
});
