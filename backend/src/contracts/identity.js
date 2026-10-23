import { z } from 'zod';

const digest32Schema = z.instanceof(Uint8Array).refine(
  (value) => value.byteLength === 32,
  'digest must be exactly 32 bytes',
);

export const createAccountSchema = z.strictObject({
  loginIdentifier: z.string().min(3).max(64),
  passwordDigest: z.string().min(1).max(255),
  passwordParameters: z.record(z.string(), z.unknown()),
  nickname: z.string().trim().min(1).max(32),
  avatarKey: z.string().trim().min(1).max(64),
  timezoneName: z.string().trim().min(1).max(64).default('Asia/Shanghai'),
});

export const createSessionSchema = z.strictObject({
  accountId: z.string().uuid(),
  entryPointId: z.string().uuid(),
  tokenDigest: digest32Schema,
  deviceId: z.string().max(128).nullable().default(null),
  expiresAt: z.string().datetime({ offset: true }),
});

export const sessionLookupSchema = z.strictObject({
  tokenDigest: digest32Schema,
});

export const updateProfileSchema = z.strictObject({
  accountId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  nickname: z.string().trim().min(1).max(32),
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
