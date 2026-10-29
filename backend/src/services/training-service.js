import { randomUUID } from 'node:crypto';

import {
  startTrainingRequestSchema,
  trainingActionRequestSchema,
} from '@404notfound/contracts';

import { ConflictError, InvalidInputError, NotFoundError } from '../domain/errors.js';

const FIVE_SENSES = Object.freeze({
  definitionId: 'FIVE_SENSES',
  title: '五感安定练习',
  steps: Object.freeze([
    Object.freeze({ stepId: 'SEE', title: '看见', instruction: '慢慢环顾四周，说出五样你能看见的东西。' }),
    Object.freeze({ stepId: 'TOUCH', title: '触碰', instruction: '留意四种你能触碰或感受到的质地。' }),
    Object.freeze({ stepId: 'HEAR', title: '听见', instruction: '安静片刻，辨认三种你能听见的声音。' }),
    Object.freeze({ stepId: 'SMELL', title: '闻到', instruction: '留意两种你能闻到或能回想起的气味。' }),
    Object.freeze({ stepId: 'TASTE', title: '尝到', instruction: '留意一种此刻能尝到的味道，然后按自己的节奏结束。' }),
  ]),
});

const DEFINITIONS = {
  FIVE_SENSES,
  BREATHING: { title: '呼吸练习', steps: [
    { stepId: 'IN', title: '吸气', instruction: '以舒服的幅度吸气约四秒；不适时恢复自然呼吸并退出。' },
    { stepId: 'OUT', title: '呼气', instruction: '慢慢呼气约六秒，不必憋气。可重复，也可在此结束。' },
  ] },
  PAUSE_ORGANIZE: { title: '暂停整理', steps: [
    { stepId: 'STOP', title: '先停一下', instruction: '暂时停下手头的事，把注意力放在身体支撑的位置。' },
    { stepId: 'NAME', title: '描述事实', instruction: '只描述发生的事，不急着评价自己。' },
    { stepId: 'CHOOSE', title: '选择下一步', instruction: '选一件现在能完成的小事，或者先休息。' },
  ] },
  TASK_SPLIT: { title: '任务拆分', steps: [
    { stepId: 'GOAL', title: '明确任务', instruction: '写下你想完成的一件事。' },
    { stepId: 'SMALL', title: '缩小步骤', instruction: '把第一步缩小到十分钟内可以开始的动作。' },
    { stepId: 'START', title: '安排行动', instruction: '决定何时开始；需要个性化整理时可进入事情整理。' },
  ] },
};

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
      step,
    };
  }
}
