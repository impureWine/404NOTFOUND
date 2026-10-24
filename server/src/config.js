import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z.strictObject({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  APP_ORIGIN: z.url(),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_SECURE: booleanFromString.default('false'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  AI_PROVIDER: z.string().optional().default(''),
  AI_MODEL: z.string().optional().default(''),
  AI_API_KEY: z.string().optional().default(''),
});

export const loadConfig = (environment = process.env) => {
  const input = Object.fromEntries(
    Object.keys(envSchema.shape)
      .filter((key) => environment[key] !== undefined)
      .map((key) => [key, environment[key]]),
  );
  return envSchema.parse(input);
};
