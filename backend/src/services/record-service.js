import {
  clearConfirmationRequestSchema,
  clearRecordRequestSchema,
  createRecordRequestSchema,
  listRecordsQuerySchema,
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

  async create(context, body) {
    const value = parse(createRecordRequestSchema, body);
    this.consentService.assert(context, value.consentId, 'SAVE', 'RECORD_CREATE', {
      kind: value.kind,
      content: value.content,
    });
    if (value.kind !== 'CONVERSATION') {
      const error = new Error('当前纵向链仅开放会话记录保存');
      error.code = 'SERVICE_UNAVAILABLE';
      throw error;
    }
    const created = await this.repository.create({
      ...this.scope(context),
      requestId: value.requestId,
      kind: value.kind,
      titleCiphertext: encryptProfileText(value.content.title, this.encryptionKey),
      titleKeyVersion: 1,
      details: {
        messages: [{
          role: 'USER',
          contentCiphertext: encryptProfileText(value.content.body, this.encryptionKey),
          cipherKeyVersion: 1,
        }],
      },
    }, stableHash({ kind: value.kind, content: value.content }));
    return this.publicRecord(created);
  }

  list(context, query) {
    // Express exposes req.query as a null-prototype object. Normalize it so
    // Zod strict-object validation can still reject unknown client fields.
    const value = parse(listRecordsQuerySchema, { ...query });
    return this.repository.list({
      ...this.scope(context),
      ...(value.kind ? { kind: value.kind } : {}),
      limit: value.limit,
      ...(value.cursor ? { cursor: value.cursor } : {}),
    }).then((result) => ({
      ...result,
      items: result.items.map((item) => this.publicRecord(item)),
    }));
  }

  get(context, recordId) {
    return this.repository.get({ ...this.scope(context), recordId }).then((record) => this.publicRecord(record));
  }

  publicRecord(record) {
    const result = { ...record };
    if (result.titleCiphertext) {
      result.title = decryptProfileText(result.titleCiphertext, this.encryptionKey);
      delete result.titleCiphertext;
      delete result.titleKeyVersion;
    }
    if (result.details?.messages) {
      result.details = {
        ...result.details,
        messages: result.details.messages.map((message) => {
          const next = { ...message };
          if (next.contentCiphertext) {
            next.content = decryptProfileText(next.contentCiphertext, this.encryptionKey);
            delete next.contentCiphertext;
            delete next.cipherKeyVersion;
          }
          return next;
        }),
      };
    }
    return result;
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
