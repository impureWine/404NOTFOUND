import { randomUUID } from 'node:crypto';

import {
  createAgentTaskRequestSchema,
  createSearchTaskRequestSchema,
  createSessionRequestSchema,
  sessionActionRequestSchema,
} from '@404notfound/contracts';

import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new InvalidInputError('请求字段不符合接口契约', result.error.issues);
  return result.data;
}

export class TaskService {
  constructor({ searchProvider, consentService, modelAdapter = null }) {
    this.searchProvider = searchProvider;
    this.consentService = consentService;
    this.modelAdapter = modelAdapter;
    this.sessions = new Map();
    this.agentTasks = new Map();
    this.searchTasks = new Map();
  }

  ownerKey(context) {
    const principal = context.accountId ?? `anonymous:${context.sessionId}`;
    return `${principal}:entry:${context.entryPointId ?? 'unknown'}`;
  }

  createSession(context, body) {
    const value = parse(createSessionRequestSchema, body);
    const session = {
      sessionId: randomUUID(),
      activityId: randomUUID(),
      sessionGeneration: 0,
      activityGeneration: 0,
      mode: value.mode,
      state: 'ready',
      ownerKey: this.ownerKey(context),
      contextSessionId: context.sessionId,
    };
    this.sessions.set(session.sessionId, session);
    return this.publicSession(session);
  }

  getSession(context, sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerKey !== this.ownerKey(context)) throw new NotFoundError();
    return session;
  }

  action(context, sessionId, body) {
    const value = parse(sessionActionRequestSchema, body);
    const session = this.getSession(context, sessionId);
    if (
      session.sessionGeneration !== value.expectedSessionGeneration
      || session.activityGeneration !== value.expectedActivityGeneration
    ) {
      throw new ConflictError('会话代次已经变化');
    }
    const allowedStates = {
      PAUSE: ['ready', 'running'],
      RESUME: ['paused'],
      RESTART: ['ready', 'running', 'paused', 'reviewing'],
      FINISH_REHEARSAL: ['running', 'paused'],
      END: ['ready', 'running', 'paused', 'reviewing'],
    }[value.action];
    if (!allowedStates.includes(session.state)) {
      throw new ConflictError(`会话处于 ${session.state}，不能执行 ${value.action}`);
    }
    if (value.action === 'FINISH_REHEARSAL' && session.mode !== 'REHEARSE') {
      throw new ConflictError('只有排练会话可以完成排练');
    }
    if (value.action === 'PAUSE') session.state = 'paused';
    if (value.action === 'RESUME') session.state = 'running';
    if (value.action === 'FINISH_REHEARSAL') session.state = 'reviewing';
    if (value.action === 'END') session.state = 'ended';
    if (value.action === 'RESTART') {
      session.activityId = randomUUID();
      session.activityGeneration += 1;
      session.state = 'ready';
    }
    if (['PAUSE', 'RESTART', 'FINISH_REHEARSAL', 'END'].includes(value.action)) {
      this.cancelSessionTasks(session.sessionId);
    }
    return this.publicSession(session);
  }

  createSearchTask(context, body) {
    const value = parse(createSearchTaskRequestSchema, body);
    this.consentService.assert(context, value.consentId, 'SEARCH_PROCESS', 'SEARCH_TASK_CREATE', {
      sessionId: value.sessionId,
      activityId: value.activityId,
      sessionGeneration: value.sessionGeneration,
      activityGeneration: value.activityGeneration,
      question: value.question,
    });
    const session = this.getSession(context, value.sessionId);
    if (
      session.activityId !== value.activityId
      || session.sessionGeneration !== value.sessionGeneration
      || session.activityGeneration !== value.activityGeneration
      || !['ready', 'running'].includes(session.state)
    ) {
      throw new ConflictError('查询任务不属于当前活动');
    }
    const controller = new AbortController();
    const task = {
      requestId: value.requestId,
      ownerKey: session.ownerKey,
      sessionId: session.sessionId,
      activityId: session.activityId,
      sessionGeneration: session.sessionGeneration,
      activityGeneration: session.activityGeneration,
      status: 'pending',
      controller,
    };
    this.searchTasks.set(task.requestId, task);
    queueMicrotask(async () => {
      if (task.status === 'cancelled') return;
      task.status = 'running';
      try {
        const result = await this.searchProvider.search({ question: value.question }, { signal: controller.signal });
        const current = this.sessions.get(task.sessionId);
        if (
          task.status === 'cancelled'
          || !current
          || current.activityGeneration !== task.activityGeneration
          || current.sessionGeneration !== task.sessionGeneration
          || current.state === 'ended'
        ) return;
        Object.assign(task, { status: 'completed', answer: result.searchState === 'EMPTY' ? '' : `找到 ${result.sources.length} 条来源`, ...result });
      } catch (error) {
        if (task.status !== 'cancelled') {
          task.status = 'failed';
          task.failureReason = error.code ?? 'SERVICE_UNAVAILABLE';
        }
      }
    });
    return this.publicTask(task);
  }

  createAgentTask(context, body) {
    const value = parse(createAgentTaskRequestSchema, body);
    const consentPayload = this.agentConsentPayload(value);
    this.consentService.assert(
      context,
      value.consentId,
      'AI_PROCESS',
      'AGENT_TASK_CREATE',
      consentPayload,
    );
    const session = this.getSession(context, value.sessionId);
    if (
      session.activityId !== value.activityId
      || session.sessionGeneration !== value.sessionGeneration
      || session.activityGeneration !== value.activityGeneration
      || session.mode !== value.mode
      || ['paused', 'reviewing', 'ended'].includes(session.state)
    ) {
      throw new ConflictError('AI 任务不属于当前可运行活动');
    }
    if (!this.modelAdapter) {
      const error = new Error('模型适配器不可用');
      error.code = 'SERVICE_UNAVAILABLE';
      throw error;
    }
    if (value.selectedContextIds.length > 0) {
      throw new InvalidInputError('当前版本尚未接入历史消息读取，请仅提交本轮明确选择的文本');
    }
    if (this.agentTasks.has(value.requestId)) {
      throw new ConflictError('requestId 已用于另一个 AI 任务');
    }

    const controller = new AbortController();
    const task = {
      requestId: value.requestId,
      ownerKey: session.ownerKey,
      sessionId: session.sessionId,
      activityId: session.activityId,
      sessionGeneration: session.sessionGeneration,
      activityGeneration: session.activityGeneration,
      status: 'pending',
      controller,
    };
    this.agentTasks.set(task.requestId, task);
    session.state = 'running';

    queueMicrotask(async () => {
      if (task.status === 'cancelled') return;
      task.status = 'running';
      try {
        const response = await this.modelAdapter.respond(
          this.buildAgentModelRequest(value, session),
          { signal: controller.signal },
        );
        const current = this.sessions.get(task.sessionId);
        if (
          task.status === 'cancelled'
          || !current
          || current.activityId !== task.activityId
          || current.activityGeneration !== task.activityGeneration
          || current.sessionGeneration !== task.sessionGeneration
          || ['paused', 'reviewing', 'ended'].includes(current.state)
        ) return;

        if (response.status !== 'success') {
          task.status = 'failed';
          task.failureReason = this.modelFailureReason(response.error?.code);
          return;
        }
        task.status = 'completed';
        task.result = {
          text: response.result.content,
          userMessageId: randomUUID(),
          replyMessageId: randomUUID(),
        };
      } catch {
        if (task.status !== 'cancelled') {
          task.status = 'failed';
          task.failureReason = 'PROVIDER_UNAVAILABLE';
        }
      }
    });
    return this.publicTask(task);
  }

  getAgentTask(context, requestId) {
    const task = this.agentTasks.get(requestId);
    if (!task || task.ownerKey !== this.ownerKey(context)) throw new NotFoundError();
    return this.publicTask(task);
  }

  cancelAgentTask(context, requestId) {
    const task = this.agentTasks.get(requestId);
    if (!task || task.ownerKey !== this.ownerKey(context)) throw new NotFoundError();
    task.status = 'cancelled';
    task.controller.abort();
    delete task.result;
    delete task.failureReason;
    return this.publicTask(task);
  }

  invalidateContext(context) {
    if (!context?.sessionId) return { sessionsInvalidated: 0 };
    return this.invalidateSessions((session) => session.contextSessionId === context.sessionId);
  }

  invalidateAccount(accountId) {
    if (!accountId) return { sessionsInvalidated: 0 };
    return this.invalidateSessions((session) => session.ownerKey === accountId);
  }

  invalidateSessions(matches) {
    let sessionsInvalidated = 0;
    for (const session of this.sessions.values()) {
      if (!matches(session)) continue;
      if (session.state !== 'ended') {
        session.state = 'ended';
        session.sessionGeneration += 1;
      }
      this.cancelSessionTasks(session.sessionId, { includeCompleted: true });
      sessionsInvalidated += 1;
    }
    return { sessionsInvalidated };
  }

  agentConsentPayload(value) {
    return {
      sessionId: value.sessionId,
      activityId: value.activityId,
      sessionGeneration: value.sessionGeneration,
      activityGeneration: value.activityGeneration,
      mode: value.mode,
      operation: value.operation,
      selectedText: value.selectedText,
      selectedContextIds: value.selectedContextIds,
      ...(value.simulation ? { simulation: value.simulation } : {}),
      ...(value.recognizedMessageIds ? { recognizedMessageIds: value.recognizedMessageIds } : {}),
      ...(value.resourceId ? { resourceId: value.resourceId, resourceVersion: value.resourceVersion } : {}),
      ...(value.objectDraft ? { objectDraft: value.objectDraft } : {}),
    };
  }

  buildAgentModelRequest(value, session) {
    return {
      contract_version: '1.1',
      request_id: value.requestId,
      session_id: value.sessionId,
      mode: 'COMPANION',
      task_type: value.operation === 'REHEARSAL_SUMMARIZE' ? 'CONTEXT_SUMMARY' : 'COMPANION_REPLY',
      locale: 'zh-CN',
      state: {
        session_state: session.state,
        confirmed_goal: null,
        history_retention: false,
        long_term_memory_enabled: false,
      },
      context: {
        summary: null,
        recent_messages: [{ role: 'user', content: value.selectedText }],
        sources: [],
        relevant_memories: [],
      },
      constraints: {
        max_output_tokens: 256,
        require_sources: false,
        allowed_actions: value.mode === 'ORGANIZE'
          ? ['STAY', 'ASK_CLARIFICATION', 'OFFER_PLAN', 'END']
          : ['STAY', 'ASK_CLARIFICATION', 'OFFER_EXERCISE', 'END'],
        forbidden_claims: ['DIAGNOSIS', 'TREATMENT_GUARANTEE', 'EMERGENCY_SERVICE_COMPLETED'],
      },
      metadata: {
        trace_id: value.requestId,
        prompt_version: 'companion-v1',
      },
    };
  }

  modelFailureReason(code) {
    if (code === 'MODEL_TIMEOUT') return 'TIMEOUT';
    if (['INVALID_MODEL_OUTPUT', 'EMPTY_MODEL_OUTPUT', 'INVALID_REQUEST'].includes(code)) {
      return 'OUTPUT_INVALID';
    }
    return 'PROVIDER_UNAVAILABLE';
  }

  publicTask(task) {
    const { ownerKey: _ownerKey, controller: _controller, ...result } = task;
    return result;
  }

  publicSession(session) {
    const { ownerKey: _ownerKey, contextSessionId: _contextSessionId, ...result } = session;
    return result;
  }

  getSearchTask(context, requestId) {
    const task = this.searchTasks.get(requestId);
    if (!task || task.ownerKey !== this.ownerKey(context)) throw new NotFoundError();
    return this.publicTask(task);
  }

  cancelSearchTask(context, requestId) {
    const task = this.searchTasks.get(requestId);
    if (!task || task.ownerKey !== this.ownerKey(context)) throw new NotFoundError();
    task.status = 'cancelled';
    task.controller.abort();
    delete task.answer;
    delete task.sources;
    return this.publicTask(task);
  }

  cancelSessionTasks(sessionId, { includeCompleted = false } = {}) {
    for (const task of this.agentTasks.values()) {
      if (
        task.sessionId === sessionId
        && (includeCompleted || ['pending', 'running'].includes(task.status))
        && !['cancelled', 'expired'].includes(task.status)
      ) {
        task.status = 'cancelled';
        task.controller.abort();
        delete task.result;
        delete task.failureReason;
      }
    }
    for (const task of this.searchTasks.values()) {
      if (
        task.sessionId === sessionId
        && (includeCompleted || ['pending', 'running'].includes(task.status))
        && !['cancelled', 'expired'].includes(task.status)
      ) {
        task.status = 'cancelled';
        task.controller.abort();
        delete task.answer;
        delete task.sources;
        delete task.failureReason;
      }
    }
  }
}
