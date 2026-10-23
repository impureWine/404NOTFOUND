import { z } from 'zod';

export const MODEL_MODES = ['COMPANION', 'SEARCH', 'SAFETY'];
export const MODEL_TASK_TYPES = [
  'CLASSIFY_INTENT',
  'COMPANION_REPLY',
  'QUERY_REWRITE',
  'SEARCH_SUMMARY',
  'CONTEXT_SUMMARY',
  'EXERCISE_CLOSING',
];
export const MODEL_ACTIONS = [
  'STAY',
  'ASK_CLARIFICATION',
  'OFFER_EXERCISE',
  'OFFER_SEARCH',
  'OFFER_PLAN',
  'END',
  'NONE',
];

const messageSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(4000),
});

const sourceSchema = z.strictObject({
  source_id: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  url: z.url().max(2000),
  publisher: z.string().min(1).max(300),
  published_at: z.string().max(50).nullable(),
  retrieved_at: z.string().max(50),
  snippet: z.string().max(4000),
  reliability: z.enum(['TRUSTED', 'UNVERIFIED', 'CONFLICTING']),
});

const memorySchema = z.strictObject({
  memory_id: z.string().min(1).max(100),
  kind: z.string().min(1).max(100),
  content: z.string().min(1).max(1000),
  confirmed_at: z.string().max(50),
  updated_at: z.string().max(50),
  expires_at: z.string().max(50),
  version: z.number().int().positive(),
});

export const modelRequestSchema = z.strictObject({
  contract_version: z.literal('1.1'),
  request_id: z.string().min(1).max(100),
  session_id: z.string().min(1).max(100),
  mode: z.enum(MODEL_MODES),
  task_type: z.enum(MODEL_TASK_TYPES),
  locale: z.literal('zh-CN'),
  state: z.strictObject({
    session_state: z.string().min(1).max(50),
    confirmed_goal: z.string().max(1000).nullable().optional(),
    history_retention: z.boolean(),
    long_term_memory_enabled: z.boolean().default(false),
  }),
  context: z.strictObject({
    summary: z.union([z.string().max(4000), z.record(z.string(), z.unknown()), z.null()]),
    recent_messages: z.array(messageSchema).max(12),
    sources: z.array(sourceSchema).max(8),
    relevant_memories: z.array(memorySchema).max(8).default([]),
  }),
  constraints: z.strictObject({
    max_output_tokens: z.number().int().min(1).max(2048),
    require_sources: z.boolean(),
    allowed_actions: z.array(z.enum(MODEL_ACTIONS)).min(1),
    forbidden_claims: z.array(z.string().min(1).max(100)).max(20),
  }),
  metadata: z.strictObject({
    trace_id: z.string().min(1).max(100),
    prompt_version: z.string().min(1).max(100),
  }),
});

export const providerOutputSchema = z.strictObject({
  content: z.string().min(1).max(8000),
  intent: z.enum(MODEL_MODES).nullable(),
  suggested_action: z.enum(MODEL_ACTIONS),
  citations: z.array(z.string().min(1).max(100)).max(8),
  uncertainty: z.string().max(2000).nullable(),
});
