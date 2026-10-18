import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { loginAs } from '../helpers/auth.js';
import { resetDb } from '../helpers/resetDb.js';

// Mocked so one test can force the outbox insert to throw and prove the
// whole CR decision rolls back with it. The default implementation
// forwards to the real one, so every other test in this file exercises
// the genuine insert.
vi.mock('../../src/modules/automation/automation.mutations.repository.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/modules/automation/automation.mutations.repository.js')
  >('../../src/modules/automation/automation.mutations.repository.js');
  return { ...actual, insertCrApprovedOutbox: vi.fn(actual.insertCrApprovedOutbox) };
});

import { insertCrApprovedOutbox } from '../../src/modules/automation/automation.mutations.repository.js';

let client: pg.Client;

beforeAll(async () => {
  await resetDb();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

beforeEach(() => {
  vi.mocked(insertCrApprovedOutbox).mockClear();
});

afterAll(async () => {
  await client.end();
  await resetDb();
});

// Each test needs its OWN submitted CR (deciding one moves it out of
// 'submitted'), so this picks a distinct one every call rather than
// reusing the single fixture project the auth helpers memoize.
const usedCrIds: number[] = [];

async function pickSubmittedCr(): Promise<{ id: number; code: string; version: number; pmEmail: string }> {
  const { rows } = await client.query<{ id: number; code: string; version: number; pm_email: string }>(
    `SELECT cr.id, cr.code, cr.version, u.email AS pm_email
     FROM change_requests cr
     JOIN projects p ON p.id = cr.project_id
     JOIN users u ON u.id = p.owner_id
     WHERE cr.status = 'submitted' AND cr.requested_by <> p.owner_id AND cr.id <> ALL($1::bigint[])
     ORDER BY cr.id LIMIT 1`,
    [usedCrIds],
  );
  if (!rows[0]) throw new Error('No suitable submitted CR found');
  usedCrIds.push(rows[0].id);
  return { id: rows[0].id, code: rows[0].code, version: rows[0].version, pmEmail: rows[0].pm_email };
}

async function outboxRowFor(crId: number): Promise<{ status: string } | null> {
  const { rows } = await client.query(
    `SELECT status FROM outbox WHERE event_type = 'CR_APPROVED' AND entity_id = $1 AND event_date = CURRENT_DATE`,
    [crId],
  );
  return rows[0] ?? null;
}

describe('CR decision → CR_APPROVED outbox (feature 15)', () => {
  test('approving a CR writes exactly one CR_APPROVED outbox row in the same transaction', async () => {
    const cr = await pickSubmittedCr();
    const pm = await loginAs(cr.pmEmail);

    const res = await pm.agent
      .post(`/api/v1/change-requests/${cr.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Approved for automation test', version: cr.version });

    expect(res.status).toBe(200);
    expect(await outboxRowFor(cr.id)).toMatchObject({ status: 'pending' });
  });

  test('reject writes no outbox row', async () => {
    const cr = await pickSubmittedCr();
    const pm = await loginAs(cr.pmEmail);

    const res = await pm.agent
      .post(`/api/v1/change-requests/${cr.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'reject', reason: 'Not viable', version: cr.version });

    expect(res.status).toBe(200);
    expect(await outboxRowFor(cr.id)).toBeNull();
  });

  test('return writes no outbox row', async () => {
    const cr = await pickSubmittedCr();
    const pm = await loginAs(cr.pmEmail);

    const res = await pm.agent
      .post(`/api/v1/change-requests/${cr.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'return', reason: 'Needs more detail', version: cr.version });

    expect(res.status).toBe(200);
    expect(await outboxRowFor(cr.id)).toBeNull();
  });

  test('a simulated outbox insert failure rolls back the whole decision', async () => {
    const cr = await pickSubmittedCr();
    const pm = await loginAs(cr.pmEmail);

    const { rows: historyBefore } = await client.query(
      `SELECT count(*) FROM change_history WHERE change_request_id = $1`,
      [cr.id],
    );

    vi.mocked(insertCrApprovedOutbox).mockRejectedValueOnce(new Error('simulated outbox insert failure'));

    const res = await pm.agent
      .post(`/api/v1/change-requests/${cr.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Should not stick', version: cr.version });

    expect(res.status).toBe(500);

    const { rows } = await client.query(
      `SELECT status, version FROM change_requests WHERE id = $1`,
      [cr.id],
    );
    expect(rows[0].status).toBe('submitted');
    expect(rows[0].version).toBe(cr.version);

    const { rows: historyAfter } = await client.query(
      `SELECT count(*) FROM change_history WHERE change_request_id = $1`,
      [cr.id],
    );
    expect(Number(historyAfter[0].count)).toBe(Number(historyBefore[0].count));
    expect(await outboxRowFor(cr.id)).toBeNull();
  });
});
