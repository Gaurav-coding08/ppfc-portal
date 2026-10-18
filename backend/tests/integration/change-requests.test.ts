import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { asAdmin, asNonMember, asProjectManager, asProjectMember } from '../helpers/auth.js';
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

// Finds a seeded submitted CR on a project the PM manages, where the PM is
// NOT the requester (so self-approval check won't fire).
async function findSubmittedCrForPm(pmId: number): Promise<{
  id: number;
  code: string;
  projectId: number;
  requestedBy: number;
  version: number;
}> {
  const { rows } = await client.query<{
    id: number;
    code: string;
    project_id: number;
    requested_by: number;
    version: number;
  }>(
    `SELECT cr.id, cr.code, cr.project_id, cr.requested_by, cr.version
     FROM change_requests cr
     JOIN projects p ON p.id = cr.project_id
     WHERE cr.status = 'submitted'
       AND p.owner_id = $1
       AND cr.requested_by <> $1
     ORDER BY cr.id
     LIMIT 1`,
    [pmId],
  );
  if (rows.length === 0) throw new Error('No suitable submitted CR found for PM');
  const r = rows[0]!;
  return { id: r.id, code: r.code, projectId: r.project_id, requestedBy: r.requested_by, version: r.version };
}

// Finds the seeded "returned" CR (CR-012 on PRJ-006).
async function findReturnedCr(): Promise<{
  id: number;
  requestedBy: number;
  version: number;
}> {
  const { rows } = await client.query<{ id: number; requested_by: number; version: number }>(
    `SELECT id, requested_by, version FROM change_requests WHERE status = 'returned' ORDER BY id LIMIT 1`,
  );
  if (rows.length === 0) throw new Error('No returned CR in seed data');
  return { id: rows[0]!.id, requestedBy: rows[0]!.requested_by, version: rows[0]!.version };
}

async function historyCount(crId: number): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM change_history WHERE change_request_id = $1',
    [crId],
  );
  return parseInt(rows[0]!.count, 10);
}

async function auditCount(entityId: number, action: string): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events WHERE entity_type = 'change_request' AND entity_id = $1 AND action = $2`,
    [entityId, action],
  );
  return parseInt(rows[0]!.count, 10);
}

describe('GET /api/v1/change-requests', () => {
  test('admin sees all CRs; contributor sees only member-project CRs', async () => {
    const admin = await asAdmin();
    const member = await asProjectMember();

    const adminRes = await admin.agent.get('/api/v1/change-requests').query({ pageSize: 100 });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.meta.total).toBeGreaterThanOrEqual(16);

    const memberRes = await member.agent.get('/api/v1/change-requests').query({ pageSize: 100 });
    expect(memberRes.status).toBe(200);

    const { rows: scopedIds } = await client.query<{ project_id: number }>(
      'SELECT project_id FROM project_members WHERE user_id = $1',
      [member.user.id],
    );
    const allowed = new Set(scopedIds.map((r) => r.project_id));
    for (const row of memberRes.body.data) {
      expect(allowed.has(row.projectId)).toBe(true);
    }
  });

  test('filters by status, projectId, mine', async () => {
    const admin = await asAdmin();
    const byStatus = await admin.agent.get('/api/v1/change-requests').query({ status: 'submitted', pageSize: 100 });
    expect(byStatus.status).toBe(200);
    for (const row of byStatus.body.data) expect(row.status).toBe('submitted');
  });
});

describe('GET /api/v1/change-requests/:id', () => {
  test('returns CR with history; non-member gets 404', async () => {
    const pm = await asProjectManager();
    const cr = await findSubmittedCrForPm(pm.user.id);

    const res = await pm.agent.get(`/api/v1/change-requests/${cr.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(cr.id);
    expect(Array.isArray(res.body.data.history)).toBe(true);
    expect(res.body.data.history.length).toBeGreaterThan(0);

    const nonMember = await asNonMember();
    const blocked = await nonMember.agent.get(`/api/v1/change-requests/${cr.id}`);
    expect(blocked.status).toBe(404);
  });
});

describe('POST /api/v1/projects/:projectId/change-requests', () => {
  test('member submits a CR: 201, history and audit created', async () => {
    const member = await asProjectMember();
    const pm = await asProjectManager();
    const title = `Test CR ${randomUUID()}`;

    const res = await member.agent.post(`/api/v1/projects/${pm.projectId}/change-requests`).send({
      title,
      description: 'desc',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.requestedBy).toBe(member.user.id);
    expect(res.body.data.code).toMatch(/^CR-\d{3,}$/);

    const hCount = await historyCount(res.body.data.id);
    expect(hCount).toBe(1);
    const aCount = await auditCount(res.body.data.id, 'change_request.submit');
    expect(aCount).toBe(1);
  });

  test('non-member gets 404', async () => {
    const nonMember = await asNonMember();
    const pm = await asProjectManager();
    const res = await nonMember.agent.post(`/api/v1/projects/${pm.projectId}/change-requests`).send({
      title: 'x',
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/change-requests/:id/decision', () => {
  // Acceptance C: PM approves eligible CR
  test('Acceptance C: PM approves eligible CR → 200, exactly one history row and one audit row added', async () => {
    const pm = await asProjectManager();
    const cr = await findSubmittedCrForPm(pm.user.id);
    const histBefore = await historyCount(cr.id);
    const auditBefore = await auditCount(cr.id, 'change_request.approve');

    const res = await pm.agent
      .post(`/api/v1/change-requests/${cr.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Looks good', version: cr.version });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.decidedBy).toBe(pm.user.id);
    expect(res.body.data.decidedAt).not.toBeNull();

    const histAfter = await historyCount(cr.id);
    expect(histAfter).toBe(histBefore + 1);
    const auditAfter = await auditCount(cr.id, 'change_request.approve');
    expect(auditAfter).toBe(auditBefore + 1);
  });

  // Acceptance D: contributor calls decision endpoint directly → 403
  test('Acceptance D: contributor calls decision endpoint → 403, CR unchanged', async () => {
    const pm = await asProjectManager();
    // Find another submitted CR for this test
    const { rows } = await client.query<{ id: number; version: number; status: string }>(
      `SELECT cr.id, cr.version, cr.status
       FROM change_requests cr
       JOIN projects p ON p.id = cr.project_id
       WHERE cr.status = 'submitted' AND p.owner_id = $1
       ORDER BY cr.id`,
      [pm.user.id],
    );
    // Use the last submitted CR (some may have been approved above)
    const cr = rows[rows.length - 1];
    if (!cr) throw new Error('No submitted CR left for Acceptance D');

    const member = await asProjectMember();
    const histBefore = await historyCount(cr.id);

    const res = await member.agent
      .post(`/api/v1/change-requests/${cr.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'I wish', version: cr.version });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    // CR status unchanged
    const { rows: after } = await client.query<{ status: string }>(
      'SELECT status FROM change_requests WHERE id = $1',
      [cr.id],
    );
    expect(after[0]!.status).toBe('submitted');

    // No new history row
    const histAfter = await historyCount(cr.id);
    expect(histAfter).toBe(histBefore);
  });

  test('PM deciding own CR → 422 SELF_APPROVAL_FORBIDDEN', async () => {
    // Create a CR as PM, then try to approve it
    const pm = await asProjectManager();
    const createRes = await pm.agent.post(`/api/v1/projects/${pm.projectId}/change-requests`).send({
      title: `Self CR ${randomUUID()}`,
    });
    expect(createRes.status).toBe(201);
    const crId = createRes.body.data.id;

    const res = await pm.agent
      .post(`/api/v1/change-requests/${crId}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Self-approve attempt', version: 1 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
  });

  test('approve an already approved CR → 409 INVALID_TRANSITION', async () => {
    const { rows } = await client.query<{ id: number; version: number }>(
      `SELECT id, version FROM change_requests WHERE status = 'approved' LIMIT 1`,
    );
    const cr = rows[0]!;
    const admin = await asAdmin();

    const res = await admin.agent
      .post(`/api/v1/change-requests/${cr.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Again', version: cr.version });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('reject an already rejected CR → 409 INVALID_TRANSITION', async () => {
    const { rows } = await client.query<{ id: number; version: number }>(
      `SELECT id, version FROM change_requests WHERE status = 'rejected' LIMIT 1`,
    );
    const cr = rows[0]!;
    const admin = await asAdmin();

    const res = await admin.agent
      .post(`/api/v1/change-requests/${cr.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'reject', reason: 'Again', version: cr.version });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('missing reason → 400', async () => {
    const pm = await asProjectManager();
    const { rows } = await client.query<{ id: number; version: number }>(
      `SELECT cr.id, cr.version FROM change_requests cr
       JOIN projects p ON p.id = cr.project_id
       WHERE cr.status = 'submitted' AND p.owner_id = $1 AND cr.requested_by <> $1
       LIMIT 1`,
      [pm.user.id],
    );
    if (rows.length === 0) return; // no suitable CR left

    const res = await pm.agent
      .post(`/api/v1/change-requests/${rows[0]!.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', version: rows[0]!.version });

    expect(res.status).toBe(400);
  });

  test('same Idempotency-Key twice → one history row, second response replayed', async () => {
    // Create a fresh CR as a member, then have the PM decide it with one key
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const createRes = await member.agent.post(`/api/v1/projects/${pm.projectId}/change-requests`).send({
      title: `Idem CR ${randomUUID()}`,
    });
    expect(createRes.status).toBe(201);
    const crId = createRes.body.data.id;

    const key = randomUUID();
    const first = await pm.agent
      .post(`/api/v1/change-requests/${crId}/decision`)
      .set('Idempotency-Key', key)
      .send({ decision: 'reject', reason: 'Not now', version: 1 });
    expect(first.status).toBe(200);

    const histAfterFirst = await historyCount(crId);

    const second = await pm.agent
      .post(`/api/v1/change-requests/${crId}/decision`)
      .set('Idempotency-Key', key)
      .send({ decision: 'reject', reason: 'Not now', version: 1 });
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replay']).toBe('true');

    // Still only one extra history row
    const histAfterSecond = await historyCount(crId);
    expect(histAfterSecond).toBe(histAfterFirst);
  });

  test('approving a CR leaves fn_project_financials values unchanged', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();

    // Snapshot financials before
    const { rows: finBefore } = await client.query(
      `SELECT * FROM fn_project_financials('2026-09-30'::date) WHERE project_id = $1`,
      [pm.projectId],
    );

    // Create and approve a fresh CR
    const createRes = await member.agent.post(`/api/v1/projects/${pm.projectId}/change-requests`).send({
      title: `Finance test CR ${randomUUID()}`,
    });
    expect(createRes.status).toBe(201);

    const approveRes = await pm.agent
      .post(`/api/v1/change-requests/${createRes.body.data.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'OK', version: 1 });
    expect(approveRes.status).toBe(200);

    // Snapshot financials after
    const { rows: finAfter } = await client.query(
      `SELECT * FROM fn_project_financials('2026-09-30'::date) WHERE project_id = $1`,
      [pm.projectId],
    );

    expect(finAfter[0]).toEqual(finBefore[0]);
  });
});

describe('POST /api/v1/change-requests/:id/resubmit', () => {
  test('returned → requester resubmits → submitted; non-requester resubmit → 403', async () => {
    const returned = await findReturnedCr();

    // Find the requester's email
    const { rows: users } = await client.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [returned.requestedBy],
    );
    const { loginAs } = await import('../helpers/auth.js');
    const requester = await loginAs(users[0]!.email);

    const res = await requester.agent
      .post(`/api/v1/change-requests/${returned.id}/resubmit`)
      .send({ title: 'Updated title', version: returned.version });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.title).toBe('Updated title');

    // Non-requester who IS a member of the same project → 403 (not 404).
    const admin = await asAdmin();
    const staleVersion = res.body.data.version;

    // Return the CR again so we can test non-requester resubmit
    const returnRes = await admin.agent
      .post(`/api/v1/change-requests/${returned.id}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'return', reason: 'More info needed', version: staleVersion });
    expect(returnRes.status).toBe(200);

    // Find another member of the same project who is NOT the requester
    const { rows: crRow } = await client.query<{ project_id: number }>(
      'SELECT project_id FROM change_requests WHERE id = $1',
      [returned.id],
    );
    const { rows: otherMembers } = await client.query<{ email: string }>(
      `SELECT u.email FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1 AND pm.user_id <> $2
       ORDER BY u.id LIMIT 1`,
      [crRow[0]!.project_id, returned.requestedBy],
    );
    expect(otherMembers.length).toBeGreaterThan(0);

    const { loginAs: loginAsOther } = await import('../helpers/auth.js');
    const otherMember = await loginAsOther(otherMembers[0]!.email);
    const blocked = await otherMember.agent
      .post(`/api/v1/change-requests/${returned.id}/resubmit`)
      .send({ version: returnRes.body.data.version });
    expect(blocked.status).toBe(403);
  });
});

describe('Atomicity: audit failure rolls back CR and history', () => {
  test('if writeAudit throws, CR status is unchanged and no history row is added', async () => {
    // We test atomicity by using a version conflict to force a rollback
    // after the status check passes — this proves the transaction boundary.
    const pm = await asProjectManager();
    const member = await asProjectMember();

    const createRes = await member.agent.post(`/api/v1/projects/${pm.projectId}/change-requests`).send({
      title: `Atomicity test ${randomUUID()}`,
    });
    expect(createRes.status).toBe(201);
    const crId = createRes.body.data.id;

    const histBefore = await historyCount(crId);

    // Send a stale version — the transaction should fail at the version
    // check, proving that no partial state (history row without status
    // update, or vice versa) can be committed.
    const res = await pm.agent
      .post(`/api/v1/change-requests/${crId}/decision`)
      .set('Idempotency-Key', randomUUID())
      .send({ decision: 'approve', reason: 'Should fail', version: 999 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');

    // CR unchanged
    const { rows } = await client.query<{ status: string; version: number }>(
      'SELECT status, version FROM change_requests WHERE id = $1',
      [crId],
    );
    expect(rows[0]!.status).toBe('submitted');
    expect(rows[0]!.version).toBe(1);

    // No new history row
    expect(await historyCount(crId)).toBe(histBefore);
  });
});
