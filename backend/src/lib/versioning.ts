import type { Client, PoolClient, QueryResultRow } from 'pg';
import { notFound, versionConflict } from './errors.js';

// Optimistic-lock UPDATE: increments version and updated_at only when the
// caller-supplied version matches the current DB row. Returns the updated
// row or throws:
//   0 rows returned → re-check existence → 404 NOT_FOUND or 409 VERSION_CONFLICT
export async function updateWithVersion<T extends QueryResultRow>(
  client: PoolClient | Client,
  table: string,
  id: number,
  version: number,
  setSql: string,
  params: unknown[],
): Promise<T> {
  // Table name is always a compile-time constant from a module's own
  // repository file, never user input — safe to interpolate.
  const paramOffset = params.length;
  const sql = `UPDATE ${table}
    SET ${setSql}, version = version + 1, updated_at = now()
    WHERE id = $${paramOffset + 1} AND version = $${paramOffset + 2}
    RETURNING *`;

  const { rows } = await client.query<T>(sql, [...params, id, version]);

  if (rows.length > 0) {
    return rows[0]!;
  }

  const { rows: existing } = await client.query<{ version: number }>(
    `SELECT version FROM ${table} WHERE id = $1`,
    [id],
  );

  if (existing.length === 0) {
    throw notFound();
  }

  throw versionConflict('Resource was modified by someone else', {
    currentVersion: existing[0]!.version,
  });
}
