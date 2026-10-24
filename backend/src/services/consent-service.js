import { randomUUID } from 'node:crypto';

import { createConsentRequestSchema } from '@404notfound/contracts';

import { InvalidInputError, NotFoundError } from '../domain/errors.js';
import { stableHash } from '../domain/stable-hash.js';

function payloadDigest(payload) {
  return stableHash(payload).toString('hex');
}

export class ConsentService {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.consents = new Map();
  }

  ownerKey(context) {
    return context.accountId ?? `anonymous:${context.sessionId}`;
  }

  create(context, body) {
    const result = createConsentRequestSchema.safeParse(body);
    if (!result.success) throw new InvalidInputError('请求字段不符合接口契约', result.error.issues);
    const expiresAt = new Date(this.now().getTime() + 5 * 60 * 1000);
    const consent = {
      consentId: randomUUID(),
      ownerKey: this.ownerKey(context),
      purpose: result.data.purpose,
      operation: result.data.operation,
      payloadDigest: payloadDigest(result.data.payload),
      expiresAt,
      revoked: false,
    };
    this.consents.set(consent.consentId, consent);
    return { consentId: consent.consentId, purpose: consent.purpose, expiresAt: expiresAt.toISOString() };
  }

  assert(context, consentId, purpose, operation, payload) {
    const consent = this.consents.get(consentId);
    if (
      !consent
      || consent.ownerKey !== this.ownerKey(context)
      || consent.purpose !== purpose
      || consent.operation !== operation
      || consent.payloadDigest !== payloadDigest(payload)
      || consent.revoked
      || consent.expiresAt <= this.now()
    ) {
      const error = new Error('用途许可不存在、已过期或范围不匹配');
      error.code = 'ACCESS_DENIED';
      throw error;
    }
  }

  revoke(context, consentId) {
    const consent = this.consents.get(consentId);
    if (!consent || consent.ownerKey !== this.ownerKey(context)) throw new NotFoundError();
    consent.revoked = true;
    return { revoked: true };
  }
}
