import { randomUUID } from 'node:crypto';
import catalogue from '../../../shared/training-definitions.json' with { type: 'json' };

import {
  startTrainingRequestSchema,
  trainingActionRequestSchema,
} from '@404notfound/contracts';

import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';

const DEFINITIONS = Object.fromEntries(catalogue.definitions.map(value => [value.id, value]));

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new InvalidInputError('请求字段不符合训练接口契约', result.error.issues);
  }
  return result.data;
}

export class TrainingService {
  constructor({ now = Date.now } = {}) {
    this.now = now;
    this.sessions = new Map();
  }

  ownerKey(context) {
    return context.accountId ?? `anonymous:${context.sessionId}`;
  }

  start(context, body) {
    const value = parse(startTrainingRequestSchema, body);
    const definition = DEFINITIONS[value.definitionId];
    const session = {
      trainingSessionId: randomUUID(),
      definitionId: value.definitionId,
      title: definition.title,
      state: 'running',
      stepIndex: 0,
      elapsedMs: 0,
      activeSince: this.now(),
      version: 0,
      ownerKey: this.ownerKey(context),
    };
    this.sessions.set(session.trainingSessionId, session);
    return this.publicSession(session);
  }

  get(context, trainingSessionId) {
    return this.publicSession(this.getOwned(context, trainingSessionId));
  }

  action(context, trainingSessionId, body) {
    const value = parse(trainingActionRequestSchema, body);
    const session = this.getOwned(context, trainingSessionId);
    if (session.version !== value.expectedVersion) {
      throw new ConflictError('训练状态已变化，请刷新后重试');
    }

    const allowed = {
      NEXT: ['running'],
      PAUSE: ['running'],
      RESUME: ['paused'],
      EXIT: ['running', 'paused'],
    }[value.action];
    if (!allowed.includes(session.state)) {
      throw new ConflictError(`训练处于 ${session.state}，不能执行 ${value.action}`);
    }

    if (value.action === 'PAUSE') {
      this.settleElapsed(session);
      session.state = 'paused';
    } else if (value.action === 'RESUME') {
      session.state = 'running';
      session.activeSince = this.now();
    } else if (value.action === 'EXIT') {
      this.settleElapsed(session);
      session.state = 'exited';
    } else if (value.action === 'NEXT') {
      if (session.stepIndex === DEFINITIONS[session.definitionId].steps.length - 1) {
        this.settleElapsed(session);
        session.state = 'completed';
      } else {
        session.stepIndex += 1;
      }
    }
    session.version += 1;
    return this.publicSession(session);
  }

  getOwned(context, trainingSessionId) {
    const session = this.sessions.get(trainingSessionId);
    if (!session || session.ownerKey !== this.ownerKey(context)) {
      throw new NotFoundError('训练会话不存在');
    }
    return session;
  }

  settleElapsed(session) {
    if (session.activeSince !== null) {
      session.elapsedMs += Math.max(0, this.now() - session.activeSince);
      session.activeSince = null;
    }
  }

  publicSession(session) {
    const elapsedMs = session.state === 'running'
      ? session.elapsedMs + Math.max(0, this.now() - session.activeSince)
      : session.elapsedMs;
    const step = ['completed', 'exited'].includes(session.state)
      ? null
      : DEFINITIONS[session.definitionId].steps[session.stepIndex];
    return {
      trainingSessionId: session.trainingSessionId,
      definitionId: session.definitionId,
      title: session.title,
      state: session.state,
      stepIndex: session.stepIndex,
      totalSteps: DEFINITIONS[session.definitionId].steps.length,
      elapsedMs,
      version: session.version,
      step: step ? { stepId: step.stepId, title: step.title, instruction: step.instruction } : null,
    };
  }
}
