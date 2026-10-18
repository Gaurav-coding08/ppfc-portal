import pg from 'pg';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { loginAs } from '../helpers/auth.js';
import { resetDb } from '../helpers/resetDb.js';

let client: pg.Client;

beforeAll(async () => {
  await resetDb();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await resetDb();
});

async function emailFor(userId: number): Promise<string> {
  const { rows } = await client.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) throw new Error(`No seeded user ${userId}`);
  return rows[0].email;
}

describe('automation routes are admin-only', () => {
  test('contributor calling any /admin/automation/* route → 403', async () => {
    const contributorEmail = await emailFor(6);
    const contributor = await loginAs(contributorEmail);

    const run = await contributor.agent.post('/api/v1/admin/automation/overdue-escalation/run');
    expect(run.status).toBe(403);

    const runs = await contributor.agent.get('/api/v1/admin/automation/runs');
    expect(runs.status).toBe(403);

    const outbox = await contributor.agent.get('/api/v1/admin/automation/outbox');
    expect(outbox.status).toBe(403);

    const retry = await contributor.agent.post('/api/v1/admin/automation/outbox/1/retry');
    expect(retry.status).toBe(403);
  });
});

describe('GET /api/v1/notifications', () => {
  test('returns only the caller\'s own rows', async () => {
    // Seeded notifications (scripts/generate/automation.ts): user 6 has
    // two (both already read), user 2 has two (unread), user 7 has one.
    const user6 = await loginAs(await emailFor(6));
    const res = await user6.agent.get('/api/v1/notifications');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((n: { userId: number }) => n.userId === 6)).toBe(true);
    expect(typeof res.body.unreadCount).toBe('number');
  });

  test('?unread=true filters to unread only', async () => {
    const user2 = await loginAs(await emailFor(2));
    const all = await user2.agent.get('/api/v1/notifications');
    const unread = await user2.agent.get('/api/v1/notifications').query({ unread: 'true' });

    expect(unread.status).toBe(200);
    expect(unread.body.data.every((n: { readAt: string | null }) => n.readAt === null)).toBe(true);
    expect(unread.body.data.length).toBeLessThanOrEqual(all.body.data.length);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  test('marks the caller\'s own notification read, idempotently', async () => {
    const user7 = await loginAs(await emailFor(7));
    const list = await user7.agent.get('/api/v1/notifications');
    const target = list.body.data[0];
    expect(target).toBeTruthy();

    const first = await user7.agent.patch(`/api/v1/notifications/${target.id}/read`);
    expect(first.status).toBe(200);
    expect(first.body.data.readAt).not.toBeNull();

    const second = await user7.agent.patch(`/api/v1/notifications/${target.id}/read`);
    expect(second.status).toBe(200);
    expect(second.body.data.readAt).not.toBeNull();
  });

  test('another user\'s notification id → 404', async () => {
    const user6 = await loginAs(await emailFor(6));
    const user2 = await loginAs(await emailFor(2));

    const list = await user2.agent.get('/api/v1/notifications');
    const notMine = list.body.data[0];
    expect(notMine).toBeTruthy();

    const res = await user6.agent.patch(`/api/v1/notifications/${notMine.id}/read`);
    expect(res.status).toBe(404);
  });
});
