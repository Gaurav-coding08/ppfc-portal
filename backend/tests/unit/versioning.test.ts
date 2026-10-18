import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { updateWithVersion } from '../../src/lib/versioning.js';

let client: pg.Client;

beforeAll(async () => {
  const connString = process.env.DATABASE_URL_TEST;
  if (!connString) throw new Error('DATABASE_URL_TEST is not set');
  client = new pg.Client({ connectionString: connString });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

describe('updateWithVersion', () => {
  it('increments version on a successful update', async () => {
    const { rows: projects } = await client.query<{ id: number; version: number; name: string }>(
      'SELECT id, version, name FROM projects ORDER BY id LIMIT 1',
    );
    const project = projects[0]!;
    const originalVersion = project.version;

    await client.query('BEGIN');
    try {
      const updated = await updateWithVersion<{ id: number; version: number; name: string }>(
        client,
        'projects',
        project.id,
        originalVersion,
        'name = $1',
        [project.name],
      );
      expect(updated.version).toBe(originalVersion + 1);
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('throws 409 VERSION_CONFLICT with currentVersion when version is stale', async () => {
    const { rows: projects } = await client.query<{ id: number; version: number; name: string }>(
      'SELECT id, version, name FROM projects ORDER BY id LIMIT 1',
    );
    const project = projects[0]!;
    const staleVersion = project.version - 1;

    await client.query('BEGIN');
    try {
      await expect(
        updateWithVersion(
          client,
          'projects',
          project.id,
          staleVersion,
          'name = $1',
          [project.name],
        ),
      ).rejects.toMatchObject({
        status: 409,
        code: 'VERSION_CONFLICT',
        details: { currentVersion: project.version },
      });
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('throws 404 NOT_FOUND when row does not exist', async () => {
    await client.query('BEGIN');
    try {
      await expect(
        updateWithVersion(
          client,
          'projects',
          999999,
          1,
          'name = $1',
          ['nonexistent'],
        ),
      ).rejects.toMatchObject({
        status: 404,
        code: 'NOT_FOUND',
      });
    } finally {
      await client.query('ROLLBACK');
    }
  });
});
