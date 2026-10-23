import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import { createAccountSchema } from '../../src/contracts/identity.js';
import {
  recordClearSchema,
  recordCreateSchema,
  scopeSchema,
} from '../../src/contracts/records.js';
import { searchInputSchema } from '../../src/contracts/search.js';

const cipher = (value) => Buffer.from(`synthetic:${value}`, 'utf8');

test('shared contracts reject zero UUIDs and unknown request fields', () => {
  assert.equal(scopeSchema.safeParse({
    accountId: '00000000-0000-0000-0000-000000000000',
    entryPointId: randomUUID(),
  }).success, false);

  assert.equal(recordClearSchema.safeParse({
    accountId: randomUUID(),
    entryPointId: randomUUID(),
    recordId: randomUUID(),
    requestId: randomUUID(),
    expectedVersion: 1,
    confirmationId: randomUUID(),
    confirmed: true,
    ownerFromClient: randomUUID(),
  }).success, false);
});

test('text limits count Unicode code points instead of UTF-16 code units', () => {
  const emojiQuestion = '😀'.repeat(4000);
  assert.equal(searchInputSchema.safeParse({ question: emojiQuestion }).success, true);
  assert.equal(searchInputSchema.safeParse({ question: `${emojiQuestion}😀` }).success, false);

  const account = createAccountSchema.safeParse({
    loginIdentifier: 'unicode_user',
    passwordDigest: '$argon2id$synthetic',
    passwordParameters: {},
    nickname: '😀'.repeat(32),
    avatarKey: 'default-1',
    timezoneName: 'Asia/Shanghai',
  });
  assert.equal(account.success, true);
});

test('emotion records require a real date and supported IANA time zone', () => {
  const base = {
    accountId: randomUUID(),
    entryPointId: randomUUID(),
    requestId: randomUUID(),
    kind: 'EMOTION',
    titleCiphertext: null,
    titleKeyVersion: null,
    details: {
      recordDate: '2026-02-29',
      emotionCodes: ['平静'],
      intensity: 3,
      timezoneName: 'Mars/Olympus',
      eventCiphertext: cipher('event'),
      cipherKeyVersion: 1,
    },
  };
  assert.equal(recordCreateSchema.safeParse(base).success, false);
  assert.equal(recordCreateSchema.safeParse({
    ...base,
    details: {
      ...base.details,
      recordDate: '2028-02-29',
      timezoneName: 'Asia/Shanghai',
    },
  }).success, true);
});
