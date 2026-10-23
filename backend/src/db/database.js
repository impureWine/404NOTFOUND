import pg from 'pg';

const { Pool } = pg;

export function createPoolFromEnv(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
    max: Number(env.DATABASE_POOL_MAX ?? 10),
    statement_timeout: Number(env.DATABASE_STATEMENT_TIMEOUT_MS ?? 2000),
    connectionTimeoutMillis: Number(env.DATABASE_CONNECT_TIMEOUT_MS ?? 3000),
  });
}

export async function withTransaction(database, work) {
  if (typeof database.connect === 'function') {
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  if (typeof database.transaction === 'function') {
    return database.transaction(work);
  }

  throw new TypeError('Database must be a pg Pool/Client or PGlite instance');
}

export async function executeSqlScript(database, sql) {
  if (typeof database.exec === 'function') {
    return database.exec(sql);
  }
  return database.query(sql);
}
