import { z } from 'zod';
import {
  positiveVersionSchema,
  requestIdSchema,
  textByCodePoints,
} from './common.js';

export const nicknameSchema = textByCodePoints({ min: 1, max: 32, label: '昵称', trim: true });
export const bioSchema = textByCodePoints({ min: 0, max: 200, label: '简介', trim: true });
export const avatarKeySchema = z.enum(['DEFAULT', 'CALM_BLUE', 'WARM_ORANGE', 'FOREST_GREEN']);

export const profileSchema = z.strictObject({
  nickname: nicknameSchema,
  avatarKey: avatarKeySchema,
  bio: bioSchema,
  version: positiveVersionSchema,
});

export const updateProfileRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  expectedVersion: positiveVersionSchema,
  nickname: nicknameSchema,
  avatarKey: avatarKeySchema,
  bio: bioSchema,
});

export const profileSummarySchema = z.strictObject({
  counts: z.strictObject({
    CONVERSATION: z.int().min(0),
    EMOTION: z.int().min(0),
    WORRY_OBJECT: z.int().min(0),
    REHEARSAL_DRAFT: z.int().min(0),
    DEPOSIT: z.int().min(0),
  }),
});

export const preferencesSchema = z.strictObject({
  offerHistorySave: z.boolean(),
  version: positiveVersionSchema,
});

export const updatePreferencesRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  expectedVersion: positiveVersionSchema,
  offerHistorySave: z.boolean(),
});
