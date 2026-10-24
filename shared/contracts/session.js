import { z } from 'zod';
import {
  generationSchema,
  requestIdSchema,
  selectedContextIdsSchema,
  uuidSchema,
} from './common.js';

export const sessionModeSchema = z.enum(['LISTEN', 'ORGANIZE', 'REHEARSE', 'SEARCH']);
export const sessionStateSchema = z.enum(['ready', 'running', 'paused', 'reviewing', 'ended']);

export const createSessionRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  mode: sessionModeSchema,
});

export const switchSessionRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  targetMode: sessionModeSchema,
  expectedSessionGeneration: generationSchema,
  selectedContextIds: selectedContextIdsSchema,
});

export const sessionActionSchema = z.enum([
  'PAUSE',
  'RESUME',
  'RESTART',
  'FINISH_REHEARSAL',
  'END',
]);

export const sessionActionRequestSchema = z.strictObject({
  requestId: requestIdSchema,
  action: sessionActionSchema,
  expectedSessionGeneration: generationSchema,
  expectedActivityGeneration: generationSchema,
});

export const sessionStateResponseSchema = z.strictObject({
  sessionId: uuidSchema,
  activityId: uuidSchema,
  sessionGeneration: generationSchema,
  activityGeneration: generationSchema,
  mode: sessionModeSchema,
  state: sessionStateSchema,
});
