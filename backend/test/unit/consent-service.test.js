import assert from 'node:assert/strict';
import test from 'node:test';

import { ConsentService } from '../../src/services/consent-service.js';

const context = { sessionId: 'session-a', accountId: null };
const requestId = '2f74a372-2e54-4fe7-945a-a7992cf4a06b';

test('consent is owner, scope, expiry, revocation and payload bound', () => {
  let now = new Date('2026-10-24T00:00:00.000Z');
  const service = new ConsentService({ now: () => now });
  const payload = { kind: 'CONVERSATION', content: { title: '标题', body: '正文' } };
  const consent = service.create(context, {
    requestId,
    purpose: 'SAVE',
    operation: 'RECORD_CREATE',
    payload,
  });

  assert.doesNotThrow(() => service.assert(context, consent.consentId, 'SAVE', 'RECORD_CREATE', payload));
  assert.throws(
    () => service.assert(context, consent.consentId, 'SAVE', 'RECORD_CREATE', { ...payload, kind: 'EMOTION' }),
    /范围不匹配/,
  );
  assert.throws(
    () => service.assert({ sessionId: 'session-b', accountId: null }, consent.consentId, 'SAVE', 'RECORD_CREATE', payload),
    /范围不匹配/,
  );

  service.revoke(context, consent.consentId);
  assert.throws(() => service.assert(context, consent.consentId, 'SAVE', 'RECORD_CREATE', payload), /范围不匹配/);

  const expiring = service.create(context, {
    requestId,
    purpose: 'SAVE',
    operation: 'RECORD_CREATE',
    payload,
  });
  now = new Date('2026-10-24T00:05:01.000Z');
  assert.throws(() => service.assert(context, expiring.consentId, 'SAVE', 'RECORD_CREATE', payload), /范围不匹配/);
});
