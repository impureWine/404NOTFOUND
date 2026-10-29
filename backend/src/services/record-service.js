import {
  clearConfirmationRequestSchema,
  clearRecordRequestSchema,
  createRecordRequestSchema,
  listRecordsQuerySchema,
  updateRecordRequestSchema,
  emotionContentSchema,
  worryContentSchema, rehearsalContentSchema, depositContentSchema,
  depositRequestSchema, postponeDepositRequestSchema, saveQueryRequestSchema,
} from '@404notfound/contracts';

import { ConflictError, InvalidInputError } from '../domain/errors.js';
import { stableHash } from '../domain/stable-hash.js';
import { decryptProfileText, encryptProfileText } from '../security/crypto.js';

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new InvalidInputError('请求字段不符合接口契约', result.error.issues);
  return result.data;
}

export class RecordService {
  constructor(repository, { encryptionKey, consentService, savedQueries = null }) {
    this.repository = repository;
    this.savedQueries = savedQueries;
    this.encryptionKey = encryptionKey;
    this.consentService = consentService;
  }

  scope(context) {
    return { accountId: context.accountId, entryPointId: context.entryPointId };
  }

  encode(kind, content) {
    if (kind === 'EMOTION') {
      const value = parse(emotionContentSchema, content);
      return { recordDate: value.recordDate, emotionCodes: value.emotionCodes,
        intensity: value.intensity, timezoneName: value.timezoneName,
        eventCiphertext: encryptProfileText(value.note, this.encryptionKey),
        cipherKeyVersion: value.note ? 1 : null };
    }
    if (kind === 'WORRY_OBJECT') {
      const value = parse(worryContentSchema, content);
      return { shapeCode: value.shapeCode, bodyCiphertext: encryptProfileText(value.body, this.encryptionKey), cipherKeyVersion: 1 };
    }
    if (kind === 'REHEARSAL_DRAFT') {
      const value = parse(rehearsalContentSchema, content);
      return { sceneCiphertext: encryptProfileText(value.scene, this.encryptionKey), expressionsCiphertext: encryptProfileText(JSON.stringify(value.expressions), this.encryptionKey), expressionCount: value.expressions.length, cipherKeyVersion: 1 };
    }
    if (kind === 'DEPOSIT') {
      const value = parse(depositContentSchema, content);
      if (Date.parse(value.reopenAt) <= Date.now()) throw new InvalidInputError('寄存时间必须晚于当前时间');
      return { bodyCiphertext: encryptProfileText(value.body, this.encryptionKey), cipherKeyVersion: 1, reopenAt: value.reopenAt };
    }
    if (kind === 'CONVERSATION' && (content.messages || typeof content.body === 'string')) {
      const messages = content.messages ?? [{ role: 'USER', content: content.body }];
      return { messages: messages.map(message => ({ role: message.role,
        contentCiphertext: encryptProfileText(message.content, this.encryptionKey), cipherKeyVersion: 1 })) };
    }
    throw new InvalidInputError('内容必须匹配记录类型');
  }

  present(record) {
    const { titleCiphertext, titleKeyVersion, details, ...metadata } = record;
    const result = { ...metadata, title: record.kind === 'QUERY' ? '已保存查询' : decryptProfileText(titleCiphertext, this.encryptionKey) };
    if (details && record.kind === 'CONVERSATION') result.content = { messages: details.messages.map(message => ({
      role: message.role, content: decryptProfileText(message.contentCiphertext, this.encryptionKey),
    })) };
    if (details && record.kind === 'EMOTION') result.content = {
      recordDate: details.recordDate, emotionCodes: details.emotionCodes, intensity: details.intensity,
      timezoneName: details.timezoneName, note: decryptProfileText(details.eventCiphertext, this.encryptionKey),
    };
    if (details && record.kind === 'WORRY_OBJECT') result.content = { shapeCode: details.shapeCode, body: decryptProfileText(details.bodyCiphertext, this.encryptionKey) };
    if (details && record.kind === 'REHEARSAL_DRAFT') result.content = { scene: decryptProfileText(details.sceneCiphertext, this.encryptionKey), expressions: JSON.parse(decryptProfileText(details.expressionsCiphertext, this.encryptionKey)) };
    return result;
  }

  async create(context, body) {
    const value = parse(createRecordRequestSchema, body);
    this.consentService.assert(context, value.consentId, 'SAVE', 'RECORD_CREATE', {
      kind: value.kind, content: value.content,
    });
    const details = this.encode(value.kind, value.content);
    return this.present(await this.repository.create({ ...this.scope(context), requestId: value.requestId,
      kind: value.kind, titleCiphertext: encryptProfileText(value.content.title, this.encryptionKey),
      titleKeyVersion: 1, details,
    }, stableHash({ kind: value.kind, content: value.content })));
  }

  async list(context, query) {
    const value = parse(listRecordsQuerySchema, { ...query });
    const result = await this.repository.list({ ...this.scope(context), ...value });
    return { ...result, items: result.items.map(record => this.present(record)) };
  }

  async get(context, recordId) {
    const record = await this.repository.get({ ...this.scope(context), recordId });
    if (record.kind === 'QUERY' && this.savedQueries) {
      const query = await this.savedQueries.get({ ...this.scope(context), recordId });
      return { ...this.present(record), content: { question: decryptProfileText(query.rawQueryCiphertext, this.encryptionKey),
        claims: query.claims.map(claim => ({ id: claim.id, text: decryptProfileText(claim.claimTextCiphertext, this.encryptionKey), status: claim.status, evidence: claim.evidence })) } };
    }
    return this.present(record);
  }

  async update(context, recordId, body) {
    const value = parse(updateRecordRequestSchema, body);
    const current = await this.repository.get({ ...this.scope(context), recordId });
    if (!['EMOTION', 'WORRY_OBJECT', 'REHEARSAL_DRAFT'].includes(current.kind)) throw new InvalidInputError('此记录不允许编辑');
    this.consentService.assert(context, value.consentId, 'SAVE', 'RECORD_UPDATE', {
      recordId, expectedVersion: value.expectedVersion, content: value.content,
    });
    return this.present(await this.repository.update({ ...this.scope(context), recordId,
      requestId: value.requestId, expectedVersion: value.expectedVersion,
      titleCiphertext: encryptProfileText(value.content.title, this.encryptionKey), titleKeyVersion: 1,
      details: this.encode(current.kind, value.content),
    }, stableHash({ recordId, expectedVersion: value.expectedVersion, content: value.content })));
  }

  async resolveObject(context, recordId, version) {
    const record = await this.get(context, recordId);
    if (record.kind !== 'WORRY_OBJECT' || record.version !== version) throw new ConflictError('物件类型或版本已经变化');
    return { shape: record.content.shapeCode, title: record.title, description: record.content.body };
  }

  async resolveContext(context, recordIds) {
    if (!context.accountId) throw new InvalidInputError('请登录后选择本人历史');
    const selection = await this.repository.resolveExplicitContextSelection({ ...this.scope(context), recordIds });
    const records = await Promise.all(selection.records.map(record => this.get(context, record.id)));
    const selected = records.map(record => ({ id: record.id, kind: record.kind, title: record.title, content: record.content }));
    if (JSON.stringify(selected).length > 4000) throw new InvalidInputError('所选历史超过 4000 字，请减少选择');
    return selected;
  }

  async saveQuery(context, body) {
    const value = parse(saveQueryRequestSchema, body);
    this.consentService.assert(context, value.consentId, 'SAVE', 'RECORD_CREATE', { kind: 'QUERY', searchRequestId: value.searchRequestId });
    if (!this.savedQueries) throw new InvalidInputError('查询保存服务未配置');
    const result = await this.savedQueries.save({ ...this.scope(context), requestId: value.requestId, searchRequestId: value.searchRequestId });
    return { id: result.id, kind: result.kind, version: result.version, status: result.status };
  }

  depositView(value) {
    return { id: value.id, state: value.state, version: value.version, reopenAt: value.reopenAt,
      body: value.state === 'RETRIEVED' ? decryptProfileText(value.bodyCiphertext, this.encryptionKey) : null };
  }
  async getDeposit(context, recordId) {
    return this.depositView(await this.repository.getDeposit({ ...this.scope(context), recordId }));
  }
  async retrieveDeposit(context, recordId, body) {
    const value = parse(depositRequestSchema, body);
    return this.depositView(await this.repository.retrieveDeposit({ ...this.scope(context), recordId, ...value }));
  }
  async postponeDeposit(context, recordId, body) {
    const value = parse(postponeDepositRequestSchema, body);
    return this.depositView(await this.repository.postponeDeposit({ ...this.scope(context), recordId, ...value }));
  }

  issueClearConfirmation(context, recordId, body) {
    const value = parse(clearConfirmationRequestSchema, body);
    return this.repository.issueClearConfirmation({
      ...this.scope(context),
      recordId,
      ...value,
    });
  }

  clear(context, recordId, body) {
    const value = parse(clearRecordRequestSchema, body);
    return this.repository.clear({
      ...this.scope(context),
      recordId,
      ...value,
      confirmed: true,
    });
  }
}
