import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../../scripts/inspect-data-environment.js', import.meta.url));
function run(t, env, args = []) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'beta-d6-preflight-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(path.join(cwd, '.env'), '');
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, DATABASE_URL: '', PROFILE_ENCRYPTION_KEY: '', SERPAPI_API_KEY: '',
      APP_ORIGIN: 'http://127.0.0.1:5173', SESSION_COOKIE_SECURE: 'false', SEARCH_PROVIDER: 'bing',
      DATABASE_SSL: 'false', ...env }, windowsHide: true });
  assert.ifError(result.error);
  return { ...result, report: JSON.parse(result.stdout) };
}
test('Beta D6: data environment preflight blocks missing configuration without a network call', t => {
  const result = run(t, {});
  assert.equal(result.status, 2);
  assert.ok(result.report.blockers.includes('SEARCH_NOT_CONFIGURED'));
  assert.ok(result.report.blockers.includes('DATABASE_CONFIG_MISSING_OR_INVALID'));
  assert.equal(result.report.networkAttempted, false);
  assert.equal(result.report.databaseTouched, false);
});
test('Beta D6: configuration preflight never prints credentials or mistakes presence for target verification', t => {
  const result = run(t, { DATABASE_URL: 'postgresql://synthetic_user:secret-do-not-log@127.0.0.1:1/test_db',
    PROFILE_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString('base64'), SERPAPI_API_KEY: 'synthetic-secret-serp' });
  assert.ok([0, 2].includes(result.status));
  assert.equal(result.report.configuration.databaseUrlValid, true);
  assert.equal(result.report.configuration.profileKeyValid, true);
  assert.equal(result.report.targetMigrationVerified, false);
  assert.equal(result.report.targetBackupRestoreVerified, false);
  assert.equal(result.report.productionReleaseReady, false);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-do-not-log|synthetic_user|synthetic-secret-serp|postgresql:\/\//);
});
test('Beta D6: unreadable configuration reports a fixed code without exposing its path', t => {
  const result = run(t, {}, ['--config-file', 'private-name-missing.env']);
  assert.equal(result.status, 1);
  assert.deepEqual(result.report.blockers, ['PREFLIGHT_INPUT_ERROR']);
  assert.doesNotMatch(result.stdout + result.stderr, /private-name-missing/);
});
