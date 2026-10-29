import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
const run = promisify(execFile);
// Exercise the real pg DATE parser; PGlite uses a different DATE representation.
const scenario = `
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createTestDatabase, seedScope } from './test/helpers/database.js';
import { RecordRepository } from './src/repositories/record-repository.js';
const database = await createTestDatabase();
try {
  const scope = await seedScope(database, 'calendar_date');
  const driver = { query: async (...args) => {
    const result = await database.query(...args);
    return { ...result, rows: result.rows.map(row => {
      const converted = { ...row };
      for (const field of result.fields) if (field.dataTypeID === 1082 && converted[field.name] !== null) {
        const value = converted[field.name];
        const wireDate = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
        converted[field.name] = pg.types.getTypeParser(1082)(wireDate);
      }
      return converted;
    }) };
  } };
  assert.ok((await driver.query("SELECT DATE '2026-10-29' AS day")).rows[0].day instanceof Date);
  const writer = new RecordRepository(database), reader = new RecordRepository(driver);
  for (const date of ['2026-10-29','2026-11-01','2027-01-01','2028-02-29']) {
    const created = await writer.create({ ...scope, requestId: randomUUID(), kind: 'EMOTION', details: {
      recordDate: date, emotionCodes: [], intensity: null, timezoneName: 'Asia/Hong_Kong',
    } });
    const reopened = await reader.get({ ...scope, recordId: created.id });
    assert.equal(reopened.details.recordDate, date, 'readback in ' + process.env.TZ);
    await writer.update({ ...scope, recordId: created.id, requestId: randomUUID(), expectedVersion: created.version, details: reopened.details });
    assert.equal((await reader.get({ ...scope, recordId: created.id })).details.recordDate, date, 'edit preserves the calendar day');
  }
} finally { await database.close(); }
`;
for (const timezone of ['Asia/Hong_Kong', 'UTC', 'America/Los_Angeles']) {
  test(`emotion save/read/edit keeps the selected day in ${timezone}`, async () => {
    await run(process.execPath, ['--input-type=module', '-e', scenario], {
      cwd: new URL('../../', import.meta.url), env: { ...process.env, TZ: timezone }, timeout: 30000,
    });
  });
}
