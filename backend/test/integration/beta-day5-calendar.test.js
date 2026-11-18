import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { listRecordsQuerySchema, recordDateSchema } from '@404notfound/contracts';
import { isoDateSchema } from '../../src/contracts/primitives.js';
import { recordListSchema } from '../../src/contracts/records.js';
import { ConflictError, InvalidInputError, NotFoundError } from '../../src/domain/errors.js';
import { RecordRepository } from '../../src/repositories/record-repository.js';
import { createTestDatabase, seedScope } from '../helpers/database.js';

const details = (recordDate, timezoneName = 'Asia/Shanghai') => ({
  recordDate, timezoneName, emotionCodes: [], intensity: null,
});
const range = { kind: 'EMOTION', from: '2028-02-01', to: '2028-02-29' };
async function fixture(t) {
  const database = await createTestDatabase();
  t.after(() => database.close());
  const owner = await seedScope(database, 'beta_day5_owner');
  const other = await seedScope(database, 'beta_day5_other');
  const repository = new RecordRepository(database);
  const create = (date, scope = owner, timezone = 'Asia/Shanghai') => repository.create({
    ...scope, requestId: randomUUID(), kind: 'EMOTION', details: details(date, timezone),
  });
  return { database, owner, other, repository, create };
}

test('Beta D5: shared and repository dates agree on leap years, invalid dates and four-digit years', () => {
  for (const date of ['0001-01-01', '0099-12-31', '1900-02-28', '2000-02-29', '2028-02-29', '9999-12-31']) {
    assert.equal(recordDateSchema.safeParse(date).success, true, `public ${date}`);
    assert.equal(isoDateSchema.safeParse(date).success, true, `repository ${date}`);
  }
  for (const date of ['0000-01-01', '1900-02-29', '2026-02-29', '2028-02-30', '2028-13-01', '2028-2-01', '2028-01-01T00:00:00Z']) {
    assert.equal(recordDateSchema.safeParse(date).success, false, `public ${date}`);
    assert.equal(isoDateSchema.safeParse(date).success, false, `repository ${date}`);
  }
});

test('Beta D5: repository rejects incomplete, reversed and non-emotion date ranges before querying', async () => {
  const scope = { accountId: randomUUID(), entryPointId: randomUUID() };
  const repository = new RecordRepository({ query: () => assert.fail('invalid filters must not reach SQL') });
  for (const query of [
    { kind: 'EMOTION', from: range.from }, { kind: 'EMOTION', to: range.to },
    { ...range, from: '2028-03-01' }, { ...range, kind: 'QUERY' },
    { from: range.from, to: range.to }, { ...range, to: '2028-02-30' },
  ]) {
    assert.equal(listRecordsQuerySchema.safeParse(query).success, false);
    assert.equal(recordListSchema.safeParse({ ...scope, ...query }).success, false);
    await assert.rejects(repository.list({ ...scope, ...query }), InvalidInputError);
  }
  for (const query of [{}, { kind: 'EMOTION' }, range, { ...range, from: range.to }]) {
    assert.equal(listRecordsQuerySchema.safeParse(query).success, true);
    assert.equal(recordListSchema.safeParse({ ...scope, ...query }).success, true);
  }
});

test('Beta D5: calendar follows the chosen date across zones; ownership, edits and clearing preserve associations', async t => {
  const { database, owner, other, repository, create } = await fixture(t);
  const otherAccount = { ...owner, accountId: other.accountId };
  const otherEntry = { ...owner, entryPointId: other.entryPointId };
  const before = await create('2028-01-31');
  const start = await create('2028-02-01', owner, 'Pacific/Kiritimati');
  const leap = await create('2028-02-29', owner, 'America/Los_Angeles');
  await create('2028-03-01');
  const foreignAccount = await create('2028-02-29', otherAccount);
  const foreignEntry = await create('2028-02-29', otherEntry);
  // created_at deliberately disagrees with the user-selected calendar date.
  await database.query("UPDATE saved_records SET created_at = '2020-12-31T23:59:59Z'");
  const ids = async scope => (await repository.list({ ...scope, ...range })).items.map(x => x.id).sort();
  assert.deepEqual(await ids(owner), [start.id, leap.id].sort());
  assert.deepEqual(await ids(otherAccount), [foreignAccount.id]);
  assert.deepEqual(await ids(otherEntry), [foreignEntry.id]);
  for (const scope of [otherAccount, otherEntry]) {
    await assert.rejects(repository.get({ ...scope, recordId: leap.id }), NotFoundError);
    await assert.rejects(repository.update({ ...scope, recordId: leap.id, requestId: randomUUID(), expectedVersion: 1, details: details('2028-03-01') }), NotFoundError);
    await assert.rejects(repository.issueClearConfirmation({ ...scope, recordId: leap.id, requestId: randomUUID(), expectedVersion: 1 }), NotFoundError);
  }
  assert.equal((await repository.get({ ...owner, recordId: leap.id })).details.recordDate, '2028-02-29');
  await assert.rejects(repository.resolveExplicitContextSelection({ ...owner, recordIds: [leap.id] }), ConflictError);
  const update = { ...owner, recordId: leap.id, requestId: randomUUID(), expectedVersion: 1, details: details('2028-03-01', 'America/Los_Angeles') };
  const moved = await repository.update(update);
  assert.equal(moved.version, 2);
  assert.equal((await repository.update(update)).idempotent, true);
  assert.deepEqual(await ids(owner), [start.id]);
  assert.ok((await repository.list({ ...owner, kind: 'EMOTION', from: '2028-03-01', to: '2028-03-01' })).items.some(x => x.id === leap.id));
  await assert.rejects(repository.update({ ...update, requestId: randomUUID() }), ConflictError);
  const clear = { ...owner, recordId: start.id, requestId: randomUUID(), expectedVersion: 1 };
  const confirmation = await repository.issueClearConfirmation(clear);
  await repository.clear({ ...clear, requestId: randomUUID(), confirmationId: confirmation.confirmationId, confirmed: true });
  assert.deepEqual(await ids(owner), []);
  await assert.rejects(repository.get({ ...owner, recordId: start.id }), NotFoundError);
  assert.equal((await database.query('SELECT count(*)::int AS n FROM emotion_records WHERE saved_record_id = $1', [start.id])).rows[0].n, 0);
  assert.equal((await repository.get({ ...owner, recordId: before.id })).details.recordDate, '2028-01-31');
  assert.deepEqual(await ids(otherAccount), [foreignAccount.id]);
  assert.deepEqual(await ids(otherEntry), [foreignEntry.id]);
});

test('Beta D5: calendar pagination retains PostgreSQL microseconds and binds cursor to owner, entry and dates', async t => {
  const { database, owner, other, repository, create } = await fixture(t);
  const records = [];
  for (let i = 0; i < 4; i++) records.push(await create('2028-02-29'));
  for (const [i, record] of records.entries()) {
    await database.query('UPDATE saved_records SET created_at = $2::timestamptz WHERE id = $1',
      [record.id, `2026-11-18T00:00:00.123${i < 2 ? '456' : '455'}Z`]);
  }
  const expected = (await database.query('SELECT id FROM saved_records ORDER BY created_at DESC, id DESC')).rows.map(x => x.id);
  const first = await repository.list({ ...owner, ...range, limit: 1 });
  assert.ok(first.nextCursor);
  for (const query of [
    { ...owner, ...range, from: '2028-02-02' },
    { ...owner, ...range, accountId: other.accountId },
    { ...owner, ...range, entryPointId: other.entryPointId },
    { ...owner, kind: 'EMOTION' },
  ]) await assert.rejects(repository.list({ ...query, cursor: first.nextCursor }), InvalidInputError);
  const seen = first.items.map(x => x.id);
  let cursor = first.nextCursor;
  for (let i = 0; cursor && i < 5; i++) {
    const page = await repository.list({ ...owner, ...range, limit: 1, cursor });
    seen.push(...page.items.map(x => x.id));
    cursor = page.nextCursor;
  }
  assert.equal(cursor, null);
  assert.deepEqual(seen, expected, 'no skipped or duplicated records in the same millisecond');
  const yearEnd = await create('2026-12-31');
  await create('2027-01-01');
  assert.deepEqual((await repository.list({ ...owner, kind: 'EMOTION', from: '2026-12-31', to: '2026-12-31' })).items.map(x => x.id), [yearEnd.id]);
});
