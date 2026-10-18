import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { writeAudit } from '../../src/lib/audit.js';

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

describe('writeAudit', () => {
  it('audit written in a rolled-back transaction leaves no row', async () => {
    const uniqueRequestId = `test-rollback-${Date.now()}`;

    await client.query('BEGIN');
    await writeAudit(client, {
      actorId: null,
      entityType: 'test',
      entityId: 1,
      action: 'rollback_test',
      requestId: uniqueRequestId,
    });
    await client.query('ROLLBACK');

    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*) FROM audit_events WHERE request_id = $1`,
      [uniqueRequestId],
    );
    expect(parseInt(rows[0]!.count, 10)).toBe(0);
  });

  it('strips password_hash from before/after payloads', async () => {
    const uniqueRequestId = `test-strip-${Date.now()}`;

    await client.query('BEGIN');
    await writeAudit(client, {
      actorId: null,
      entityType: 'test',
      entityId: 1,
      action: 'strip_test',
      before: { id: 1, email: 'a@b.com', password_hash: '$2a$secret' },
      after: { id: 1, email: 'a@b.com', passwordHash: '$2a$newsecret' },
      requestId: uniqueRequestId,
    });

    const { rows } = await client.query<{ before: Record<string, unknown>; after: Record<string, unknown> }>(
      `SELECT before, after FROM audit_events WHERE request_id = $1`,
      [uniqueRequestId],
    );
    await client.query('ROLLBACK');

    expect(rows[0]!.before).not.toHaveProperty('password_hash');
    expect(rows[0]!.before).toHaveProperty('email', 'a@b.com');
    expect(rows[0]!.after).not.toHaveProperty('passwordHash');
    expect(rows[0]!.after).toHaveProperty('email', 'a@b.com');
  });
});
