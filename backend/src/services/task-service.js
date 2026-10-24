import { randomUUID } from 'node:crypto';

import {
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
  constructor({ searchProvider, consentService }) {
    this.searchProvider = searchProvider;
    this.consentService = consentService;
    this.sessions = new Map();
    this.searchTasks = new Map();
  }

  ownerKey(context) {
    return context.accountId ?? `anonymous:${context.sessionId}`;
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
    };
    this.sessions.set(session.sessionId, session);
    return session;
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
    return { ...session, ownerKey: undefined };
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
      || session.state === 'ended'
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

  publicTask(task) {
    const { ownerKey: _ownerKey, controller: _controller, ...result } = task;
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

  cancelSessionTasks(sessionId) {
    for (const task of this.searchTasks.values()) {
      if (task.sessionId === sessionId && ['pending', 'running'].includes(task.status)) {
        task.status = 'cancelled';
        task.controller.abort();
      }
    }
  }
}
