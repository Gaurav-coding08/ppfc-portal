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

  // Automation (feature 15): worker.ts schedule and retry policy.
  AUTOMATION_CRON: z.string().default('*/5 * * * *'),
  AUTOMATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  AUTOMATION_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
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

// express's res.cookie() wants a millisecond maxAge, but JWT_EXPIRES_IN is
// written as a human string ("8h") to match jsonwebtoken's own `expiresIn`
// option. Parsed once at boot so a typo fails fast like the rest of env.ts,
// not on the first login request.
function parseDurationMs(input: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration "${input}" (expected e.g. "8h", "30m", "1d")`);
  }
  const unitMs: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * unitMs[match[2]!]!;
}

const raw = loadEnv();

let jwtExpiresInMs: number;
try {
  jwtExpiresInMs = parseDurationMs(raw.JWT_EXPIRES_IN);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error((err as Error).message);
  process.exit(1);
}

export const env = {
  ...raw,
  // NODE_ENV=test always talks to the dedicated test database, never the dev one.
  databaseUrl: raw.NODE_ENV === 'test' ? raw.DATABASE_URL_TEST : raw.DATABASE_URL,
  corsOrigins: raw.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
  jwtExpiresInMs,
};

export type Env = typeof env;
