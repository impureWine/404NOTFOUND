function integer(value, { name, fallback, min, max }) {
  const resolved = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(resolved) || resolved < min || resolved > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return resolved;
}

function boolean(value, { name, fallback = false }) {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function appOrigin(value) {
  const resolved = value ?? 'http://127.0.0.1:5173';
  let url;
  try {
    url = new URL(resolved);
  } catch {
    throw new Error('APP_ORIGIN must be an absolute http(s) origin');
  }
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_ORIGIN must be an absolute http(s) origin without credentials, path, query, or fragment');
  }
  return url.origin;
}

export function getRuntimeConfig(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const origin = appOrigin(env.APP_ORIGIN);
  const secureCookies = boolean(env.SESSION_COOKIE_SECURE, {
    name: 'SESSION_COOKIE_SECURE',
  });
  if (new URL(origin).protocol === 'https:' && !secureCookies) {
    throw new Error('SESSION_COOKIE_SECURE must be true when APP_ORIGIN uses https');
  }

  if (env.SEARCH_PROVIDER && env.SEARCH_PROVIDER !== 'bing') throw new Error('SEARCH_PROVIDER must be bing (via SerpAPI)');
  const market = env.BING_SEARCH_MARKET || 'zh-CN';
  if (!/^[a-z]{2,3}-[A-Z]{2}$/.test(market)) throw new Error('BING_SEARCH_MARKET must be a language-country code such as zh-CN');

  return Object.freeze({
    port: integer(env.PORT, { name: 'PORT', fallback: 3000, min: 1, max: 65_535 }),
    appOrigin: origin,
    secureCookies,
    migrateOnStart: boolean(env.MIGRATE_ON_START, { name: 'MIGRATE_ON_START' }),
    database: Object.freeze({
      url: env.DATABASE_URL,
      ssl: boolean(env.DATABASE_SSL, { name: 'DATABASE_SSL' }),
      poolMax: integer(env.DATABASE_POOL_MAX, {
        name: 'DATABASE_POOL_MAX', fallback: 10, min: 1, max: 50,
      }),
      statementTimeoutMs: integer(env.DATABASE_STATEMENT_TIMEOUT_MS, {
        name: 'DATABASE_STATEMENT_TIMEOUT_MS', fallback: 2000, min: 100, max: 60_000,
      }),
      connectTimeoutMs: integer(env.DATABASE_CONNECT_TIMEOUT_MS, {
        name: 'DATABASE_CONNECT_TIMEOUT_MS', fallback: 3000, min: 100, max: 60_000,
      }),
    }),
    search: Object.freeze({
      provider: 'bing',
      market,
      timeoutMs: integer(env.SEARCH_TIMEOUT_MS, {
        name: 'SEARCH_TIMEOUT_MS', fallback: 15000, min: 100, max: 30_000,
      }),
    }),
  });
}

export function inspectReleaseReadiness(env = process.env) {
  const issues = [];
  let config = null;
  try {
    config = getRuntimeConfig(env);
  } catch (error) {
    issues.push(error.message);
  }

  if ((env.DATABASE_URL ?? '').includes('change-me')) {
    issues.push('DATABASE_URL still contains the change-me placeholder');
  }
  if (env.PROFILE_ENCRYPTION_KEY === 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=') {
    issues.push('PROFILE_ENCRYPTION_KEY still uses the documented placeholder');
  }
  if (!env.PROFILE_ENCRYPTION_KEY) {
    issues.push('PROFILE_ENCRYPTION_KEY is required');
  }
  if (env.NODE_ENV === 'production') {
    if (!config?.secureCookies) issues.push('production requires secure session cookies');
    if (config && new URL(config.appOrigin).protocol !== 'https:') {
      issues.push('production APP_ORIGIN must use https');
    }
    if (env.MIGRATE_ON_START === 'true') {
      issues.push('production migrations must be an explicit release step');
    }
  }
  return Object.freeze({ ready: issues.length === 0, issues: Object.freeze(issues), config });
}
