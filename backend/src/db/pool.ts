import pg, { Pool } from 'pg';
import { env } from '../config/env.js';

// NUMERIC columns (money) come back from `pg` as strings by default, because
// converting straight to JS `number` can silently lose precision. We rely on
// that default rather than registering a custom type parser, so money is
// never touched by floating point until it's deliberately rounded for the
// API response — see lib/money.ts in later features.

// BIGINT columns (every `id`/`*_id` surrogate key in this schema) come back
// as strings for the same precision-safety reason — but our ids are plain
// sequential IDENTITY values, nowhere near Number.MAX_SAFE_INTEGER, so the
// safety margin NUMERIC needs doesn't apply here. Without this, every id
// silently becomes a string at the JSON boundary while every repository
// type still says `number`, and `===` comparisons against a real number
// (e.g. an authorization check comparing a loaded resource's owner_id to
// req.user.id) would wrongly fail. OID 20 is int8/bigint; see
// https://github.com/brianc/node-pg-types for the OID table.
pg.types.setTypeParser(20, (value: string) => parseInt(value, 10));

// DATE columns (OID 1082) come back from `pg` as JS `Date` objects by
// default, which `JSON.stringify`/`res.json()` then renders as a full
// ISO datetime (e.g. "2026-01-05T05:00:00.000Z", shifted by the server's
// local timezone) — not the "YYYY-MM-DD" CLAUDE.md requires everywhere.
// Postgres already sends the value as a plain YYYY-MM-DD string over the
// wire; returning it unparsed keeps that exact string end to end.
pg.types.setTypeParser(1082, (value: string) => value);

export const pool = new Pool({ connectionString: env.databaseUrl });

export async function closePool(): Promise<void> {
  await pool.end();
}
