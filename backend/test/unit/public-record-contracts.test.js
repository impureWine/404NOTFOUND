import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearConfirmationResponseSchema,
  clearRecordResponseSchema,
  recordDetailResponseSchema,
  recordSummaryResponseSchema,
} from '@404notfound/contracts';

const id = '2f74a372-2e54-4fe7-945a-a7992cf4a06b';
const base = {
  id,
  kind: 'CONVERSATION',
  title: '主动保存的对话',
  version: 1,
  createdAt: '2026-11-16T01:00:00.000Z',
  updatedAt: '2026-11-16T01:00:00.000Z',
  idempotent: false,
};

test('public record DTOs accept plaintext views and reject storage fields', () => {
  assert.equal(recordSummaryResponseSchema.safeParse(base).success, true);
  assert.equal(recordDetailResponseSchema.safeParse({
    ...base,
    content: { messages: [{ role: 'USER', content: '只在本人详情返回' }] },
  }).success, true);
  assert.equal(recordSummaryResponseSchema.safeParse({
    ...base,
    titleCiphertext: 'must-not-leak',
  }).success, false);
  assert.equal(recordDetailResponseSchema.safeParse({
    ...base,
    content: { messages: [{ role: 'USER', contentCiphertext: 'must-not-leak' }] },
  }).success, false);
});

test('clear response DTOs distinguish confirmation from completed clearing', () => {
  assert.equal(clearConfirmationResponseSchema.safeParse({
    confirmationId: id,
    expiresAt: '2026-11-16T01:02:00.000Z',
    recordId: id,
    version: 1,
    kind: 'CONVERSATION',
    idempotent: false,
  }).success, true);
  assert.equal(clearRecordResponseSchema.safeParse({
    cleared: true,
    recordId: id,
    version: 2,
    deletionJobId: id,
    idempotent: false,
  }).success, true);
});
