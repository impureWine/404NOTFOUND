import {
  clearConfirmationRequestSchema,
  clearRecordRequestSchema,
  createRecordRequestSchema,
  listRecordsQuerySchema,
  updateRecordRequestSchema,
  emotionContentSchema,
} from '@404notfound/contracts';

import { InvalidInputError } from '../domain/errors.js';
import { stableHash } from '../domain/stable-hash.js';
import { decryptProfileText, encryptProfileText } from '../security/crypto.js';

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new InvalidInputError('请求字段不符合接口契约', result.error.issues);
  return result.data;
}

export class RecordService {
  constructor(repository, { encryptionKey, consentService }) {
    this.repository = repository;
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
    if (kind === 'CONVERSATION' && (content.messages || typeof content.body === 'string')) {
      const messages = content.messages ?? [{ role: 'USER', content: content.body }];
      return { messages: messages.map(message => ({ role: message.role,
        contentCiphertext: encryptProfileText(message.content, this.encryptionKey), cipherKeyVersion: 1 })) };
    }
    throw new InvalidInputError('当前仅开放陪伴记录与情绪日历，内容必须匹配记录类型');
  }

  present(record) {
    const { titleCiphertext, titleKeyVersion, details, ...metadata } = record;
    const result = { ...metadata, title: decryptProfileText(titleCiphertext, this.encryptionKey) };
    if (details && record.kind === 'CONVERSATION') result.content = { messages: details.messages.map(message => ({
      role: message.role, content: decryptProfileText(message.contentCiphertext, this.encryptionKey),
    })) };
    if (details && record.kind === 'EMOTION') result.content = {
      recordDate: details.recordDate, emotionCodes: details.emotionCodes, intensity: details.intensity,
      timezoneName: details.timezoneName, note: decryptProfileText(details.eventCiphertext, this.encryptionKey),
    };
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
    return this.present(await this.repository.get({ ...this.scope(context), recordId }));
  }

  async update(context, recordId, body) {
    const value = parse(updateRecordRequestSchema, body);
    const current = await this.repository.get({ ...this.scope(context), recordId });
    if (current.kind !== 'EMOTION') throw new InvalidInputError('仅情绪记录允许编辑');
    this.consentService.assert(context, value.consentId, 'SAVE', 'RECORD_UPDATE', {
      recordId, expectedVersion: value.expectedVersion, content: value.content,
    });
    return this.present(await this.repository.update({ ...this.scope(context), recordId,
      requestId: value.requestId, expectedVersion: value.expectedVersion,
      titleCiphertext: encryptProfileText(value.content.title, this.encryptionKey), titleKeyVersion: 1,
      details: this.encode(current.kind, value.content),
    }, stableHash({ recordId, expectedVersion: value.expectedVersion, content: value.content })));
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
