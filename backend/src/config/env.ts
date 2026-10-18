import { z } from 'zod';

// Validated once at boot. Any missing/malformed variable crashes the process
// immediately with a readable message instead of failing later at a random
// call site.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_URL_TEST: z.string().min(1, 'DATABASE_URL_TEST is required'),

  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  REPORTING_DATE: z.string().default('2026-09-30'),
  LOG_LEVEL: z.string().default('info'),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

const raw = loadEnv();

export const env = {
  ...raw,
  // NODE_ENV=test always talks to the dedicated test database, never the dev one.
  databaseUrl: raw.NODE_ENV === 'test' ? raw.DATABASE_URL_TEST : raw.DATABASE_URL,
  corsOrigins: raw.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
};

export type Env = typeof env;
