import assert from 'node:assert/strict';
import test from 'node:test';

import { getRuntimeConfig, inspectReleaseReadiness } from '../../src/runtime-config.js';

const base = {
  DATABASE_URL: 'postgresql://app@127.0.0.1/app',
  PROFILE_ENCRYPTION_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
  APP_ORIGIN: 'http://127.0.0.1:5173',
  SESSION_COOKIE_SECURE: 'false',
};

test('runtime config normalizes bounded numbers, booleans, and origin', () => {
  const config = getRuntimeConfig({
    ...base,
    PORT: '3100',
    DATABASE_POOL_MAX: '12',
    SEARCH_TIMEOUT_MS: '8000',
    MIGRATE_ON_START: 'true',
  });
  assert.equal(config.port, 3100);
  assert.equal(config.database.poolMax, 12);
  assert.equal(config.search.timeoutMs, 8000);
  assert.equal(config.migrateOnStart, true);
  assert.equal(config.appOrigin, 'http://127.0.0.1:5173');
});

test('runtime config rejects ambiguous and unsafe release values', () => {
  assert.throws(() => getRuntimeConfig({ ...base, PORT: '0' }), /PORT/);
  assert.throws(() => getRuntimeConfig({ ...base, DATABASE_SSL: 'yes' }), /DATABASE_SSL/);
  assert.throws(() => getRuntimeConfig({ ...base, APP_ORIGIN: 'https://example.com/app' }), /APP_ORIGIN/);
  assert.throws(() => getRuntimeConfig({
    ...base,
    APP_ORIGIN: 'https://example.com',
    SESSION_COOKIE_SECURE: 'false',
  }), /SESSION_COOKIE_SECURE/);
});

test('release readiness blocks placeholders and unsafe production settings', () => {
  const blocked = inspectReleaseReadiness({
    ...base,
    DATABASE_URL: 'postgresql://app:change-me@db/app',
    PROFILE_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.issues.length, 2);

  const production = inspectReleaseReadiness({
    ...base,
    NODE_ENV: 'production',
    MIGRATE_ON_START: 'true',
  });
  assert.equal(production.ready, false);
  assert.match(production.issues.join('\n'), /secure session cookies/);
  assert.match(production.issues.join('\n'), /https/);
  assert.match(production.issues.join('\n'), /explicit release step/);
});

test('release readiness accepts a bounded production configuration', () => {
  const result = inspectReleaseReadiness({
    ...base,
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://app.example.test',
    SESSION_COOKIE_SECURE: 'true',
    MIGRATE_ON_START: 'false',
    DATABASE_SSL: 'true',
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.issues, []);
});
