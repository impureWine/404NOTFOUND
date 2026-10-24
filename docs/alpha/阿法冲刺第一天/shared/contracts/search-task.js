import { z } from 'zod';
import {
  generationSchema,
  requestIdSchema,
  textByCodePoints,
  uuidSchema,
} from './common.js';
import { taskStatusSchema } from './agent-task.js';

export const createSearchTaskRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  sessionId: uuidSchema,
  activityId: uuidSchema,
  sessionGeneration: generationSchema,
  activityGeneration: generationSchema,
  question: textByCodePoints({ min: 1, max: 4000, label: '查询问题', trim: true }),
  consentId: uuidSchema,
});

export const searchSourceSchema = z.strictObject({
  sourceId: uuidSchema,
  title: textByCodePoints({ min: 1, max: 200, label: '来源标题', trim: true }),
  url: z.url(),
  retrievedAt: z.iso.datetime({ offset: true }),
});

export const searchTaskStateSchema = z.strictObject({
  requestId: requestIdSchema,
  status: taskStatusSchema,
  sessionGeneration: generationSchema,
  activityGeneration: generationSchema,
  answer: textByCodePoints({ min: 1, max: 4000, label: '查询结果' }).optional(),
  sources: z.array(searchSourceSchema).optional(),
});
