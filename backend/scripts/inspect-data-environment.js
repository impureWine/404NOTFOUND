import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { getRuntimeConfig } from '../src/runtime-config.js';
import { parseProfileKey } from '../src/security/crypto.js';

// Read-only preflight: never connect to a database or a search provider.
// Output contains fixed status codes, never configuration values or raw errors.
const report = { startedAt: new Date().toISOString(), mode: 'configuration-only',
  networkAttempted: false, databaseTouched: false, targetMigrationVerified: false,
  targetBackupRestoreVerified: false, independentDeletionLogVerified: false,
  productionReleaseReady: false, blockers: [] };
try {
  const { values } = parseArgs({ options: { 'config-file': { type: 'string' } } });
  try { process.loadEnvFile(values['config-file']); }
  catch (error) { if (values['config-file'] || error.code !== 'ENOENT') throw error; }
  const env = process.env;
  const has = key => Boolean(env[key]?.trim());
  const configuration = report.configuration = {
    databaseUrlPresent: has('DATABASE_URL'), databaseUrlValid: false,
    profileKeyPresent: has('PROFILE_ENCRYPTION_KEY'), profileKeyValid: false,
    serpApiKeyPresent: has('SERPAPI_API_KEY'), runtimeConfigValid: false,
  };
  if (configuration.databaseUrlPresent) {
    try {
      const url = new URL(env.DATABASE_URL);
      configuration.databaseUrlValid = ['postgres:', 'postgresql:'].includes(url.protocol)
        && Boolean(url.hostname) && url.pathname.length > 1 && !env.DATABASE_URL.includes('change-me');
    } catch { /* fixed boolean only */ }
  }
  if (!configuration.databaseUrlValid) report.blockers.push('DATABASE_CONFIG_MISSING_OR_INVALID');
  try {
    parseProfileKey(env.PROFILE_ENCRYPTION_KEY);
    configuration.profileKeyValid = env.PROFILE_ENCRYPTION_KEY !== 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  } catch { /* fixed boolean only */ }
  if (!configuration.profileKeyValid) report.blockers.push('PROFILE_KEY_MISSING_INVALID_OR_PLACEHOLDER');
  if (!configuration.serpApiKeyPresent) report.blockers.push('SEARCH_NOT_CONFIGURED');
  try { getRuntimeConfig(env); configuration.runtimeConfigValid = true; }
  catch { report.blockers.push('RUNTIME_CONFIG_INVALID'); }
  report.clients = {};
  for (const command of ['psql', 'pg_dump', 'pg_restore']) {
    try {
      const output = execFileSync(command, ['--version'], { encoding: 'utf8', timeout: 5000,
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const version = output.match(/\(PostgreSQL\) (\d+(?:\.\d+){0,2})\b/)?.[1] ?? null;
      report.clients[command] = { available: Boolean(version), version };
    } catch { report.clients[command] = { available: false, version: null }; }
    if (!report.clients[command].available) report.blockers.push(`${command.toUpperCase()}_UNAVAILABLE`);
  }
  report.status = report.blockers.length ? 'blocked' : 'configuration-present-unverified';
  // Presence is never evidence of connection, migration, or recovery success.
  process.exitCode = report.blockers.length ? 2 : 0;
} catch {
  report.status = 'failed';
  report.blockers.push('PREFLIGHT_INPUT_ERROR');
  process.exitCode = 1;
}
console.log(JSON.stringify(report, null, 2));
