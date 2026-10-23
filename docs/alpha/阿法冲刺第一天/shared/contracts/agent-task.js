import { z } from 'zod';
import {
  generationSchema,
  positiveVersionSchema,
  requestIdSchema,
  selectedContextIdsSchema,
  textByCodePoints,
  uuidSchema,
} from './common.js';

const shortTextSchema = textByCodePoints({ min: 1, max: 200, label: '文本', trim: true });
const titleSchema = textByCodePoints({ min: 1, max: 80, label: '标题', trim: true });
const bodySchema = textByCodePoints({ min: 1, max: 4000, label: '正文' });

export const agentModeSchema = z.enum(['LISTEN', 'ORGANIZE', 'REHEARSE']);
export const agentOperationSchema = z.enum([
  'REPLY',
  'OBJECT_ORGANIZE',
  'REHEARSAL_REPLY',
  'REHEARSAL_SUMMARIZE',
]);

export const simulationSchema = z.strictObject({
  scene: titleSchema,
  counterpart: titleSchema,
  goal: bodySchema,
  style: shortTextSchema,
});

export const objectDraftSchema = z.strictObject({
  shape: shortTextSchema,
  title: titleSchema,
  description: bodySchema,
});

const baseAgentTask = z.strictObject({
  requestId: requestIdSchema,
  sessionId: uuidSchema,
  activityId: uuidSchema,
  sessionGeneration: generationSchema,
  activityGeneration: generationSchema,
  mode: agentModeSchema,
  operation: agentOperationSchema,
  selectedText: textByCodePoints({ min: 0, max: 4000, label: '选中文本' }),
  selectedContextIds: selectedContextIdsSchema,
  consentId: uuidSchema,
  simulation: simulationSchema.optional(),
  recognizedMessageIds: z.array(uuidSchema).min(1).max(20).optional(),
  resourceId: uuidSchema.optional(),
  resourceVersion: positiveVersionSchema.optional(),
  objectDraft: objectDraftSchema.optional(),
});

export const createAgentTaskRequestSchema = baseAgentTask.superRefine((data, context) => {
  if (!data.selectedText && data.selectedContextIds.length === 0) {
    context.addIssue({ code: 'custom', path: ['selectedText'], message: '文本和上下文至少提供一项' });
  }

  const expectedMode = {
    REPLY: ['LISTEN', 'ORGANIZE'],
    OBJECT_ORGANIZE: ['ORGANIZE'],
    REHEARSAL_REPLY: ['REHEARSE'],
    REHEARSAL_SUMMARIZE: ['REHEARSE'],
  }[data.operation];
  if (!expectedMode.includes(data.mode)) {
    context.addIssue({ code: 'custom', path: ['operation'], message: 'operation 与 mode 不匹配' });
  }

  if (data.mode === 'REHEARSE' && !data.simulation) {
    context.addIssue({ code: 'custom', path: ['simulation'], message: '排练任务必须提供 simulation' });
  }
  if (data.mode !== 'REHEARSE' && data.simulation) {
    context.addIssue({ code: 'custom', path: ['simulation'], message: '非排练任务不得提供 simulation' });
  }

  if (data.operation === 'REHEARSAL_SUMMARIZE' && !data.recognizedMessageIds) {
    context.addIssue({ code: 'custom', path: ['recognizedMessageIds'], message: '整理任务必须选择本人消息' });
  }

  if (data.operation === 'OBJECT_ORGANIZE') {
    const hasSavedResource = Boolean(data.resourceId || data.resourceVersion);
    if (hasSavedResource !== Boolean(data.resourceId && data.resourceVersion)) {
      context.addIssue({ code: 'custom', path: ['resourceId'], message: 'resourceId 与 resourceVersion 必须同时提供' });
    }
    if (Boolean(data.resourceId) === Boolean(data.objectDraft)) {
      context.addIssue({ code: 'custom', path: ['objectDraft'], message: '已保存物件与临时物件必须且只能提供一种' });
    }
  }
});

export const taskStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'cancelled',
  'failed',
  'expired',
]);
export const taskFailureReasonSchema = z.enum(['TIMEOUT', 'PROVIDER_UNAVAILABLE', 'OUTPUT_INVALID']);

export const agentTaskAcceptedSchema = z.strictObject({
  requestId: requestIdSchema,
  status: z.literal('pending'),
  sessionId: uuidSchema,
  activityId: uuidSchema,
  sessionGeneration: generationSchema,
  activityGeneration: generationSchema,
});

export const cancelTaskRequestSchema = z.strictObject({ requestId: requestIdSchema });
