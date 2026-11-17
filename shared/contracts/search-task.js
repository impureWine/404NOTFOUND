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
  id: uuidSchema,
  title: textByCodePoints({ min: 1, max: 512, label: '来源标题', trim: true }),
  url: z.url().max(2048).refine(value => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, '来源必须是无嵌入凭据的 HTTP(S) 链接'),
  snippet: textByCodePoints({ max: 4000, label: '来源摘录' }),
  publisher: textByCodePoints({ min: 1, max: 256, label: '发布者' }).nullable(),
  sourceTier: z.enum(['S1', 'S2', 'S3', 'S4', 'SX']),
  quality: z.enum(['CURRENT', 'STALE', 'UNKNOWN']),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  retrievedAt: z.iso.datetime({ offset: true }),
  verificationState: z.enum(['VERIFIED', 'PARTIAL', 'UNAVAILABLE']),
});

export const searchFailureReasonSchema = z.enum([
  'SEARCH_NOT_CONFIGURED', 'SEARCH_AUTH_FAILED', 'SEARCH_RATE_LIMITED',
  'TIMEOUT', 'SERVICE_UNAVAILABLE', 'PROVIDER_UNAVAILABLE',
]);

export const searchTaskStateSchema = z.strictObject({
  requestId: requestIdSchema,
  status: taskStatusSchema,
  sessionId: uuidSchema,
  activityId: uuidSchema,
  sessionGeneration: generationSchema,
  activityGeneration: generationSchema,
  answer: textByCodePoints({ max: 4000, label: '查询结果' }).optional(),
  searchState: z.enum(['SUCCESS', 'EMPTY']).optional(),
  sources: z.array(searchSourceSchema).max(10).optional(),
  // Search returns excerpts and source links, not generated factual claims.
  claims: z.array(z.never()).optional(),
  partial: z.boolean().optional(),
  hasConflict: z.boolean().optional(),
  uncertaintyNote: textByCodePoints({ max: 1000, label: '不确定性说明' }).optional(),
  failureReason: searchFailureReasonSchema.optional(),
}).superRefine((value, context) => {
  if (value.status === 'completed') {
    if (!value.searchState || !value.sources || value.answer === undefined) {
      context.addIssue({ code: 'custom', message: '已完成查询必须包含状态、来源和结果文本' });
    }
    if (value.searchState === 'EMPTY' && (value.sources?.length !== 0 || value.answer !== '')) {
      context.addIssue({ code: 'custom', message: '空结果不得包含来源或结果正文' });
    }
    if (value.searchState === 'SUCCESS' && !value.sources?.length) {
      context.addIssue({ code: 'custom', message: '成功查询必须包含来源' });
    }
  } else if (['answer', 'sources', 'claims', 'searchState', 'partial', 'hasConflict', 'uncertaintyNote']
    .some(field => value[field] !== undefined)) {
    context.addIssue({ code: 'custom', message: '未完成或失效查询不得包含旧结果' });
  }
  if ((value.status === 'failed') !== Boolean(value.failureReason)) {
    context.addIssue({ code: 'custom', message: '仅失败任务必须包含公开失败原因' });
  }
});
