import { z } from 'zod';

import {
  generationSchema,
  requestIdSchema,
  uuidSchema,
} from './common.js';

export const trainingDefinitionIdSchema = z.literal('FIVE_SENSES');
export const trainingStateSchema = z.enum(['running', 'paused', 'completed', 'exited']);

export const startTrainingRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  definitionId: trainingDefinitionIdSchema,
});

export const trainingActionSchema = z.enum(['NEXT', 'PAUSE', 'RESUME', 'EXIT']);
export const trainingActionRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  action: trainingActionSchema,
  expectedVersion: generationSchema,
});

export const trainingStepSchema = z.strictObject({
  stepId: z.string().min(1).max(40),
  title: z.string().min(1).max(80),
  instruction: z.string().min(1).max(300),
});

export const trainingStateResponseSchema = z.strictObject({
  trainingSessionId: uuidSchema,
  definitionId: trainingDefinitionIdSchema,
  title: z.string().min(1).max(80),
  state: trainingStateSchema,
  stepIndex: generationSchema,
  totalSteps: z.number().int().positive(),
  elapsedMs: generationSchema,
  version: generationSchema,
  step: trainingStepSchema.nullable(),
});
