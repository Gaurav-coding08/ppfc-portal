import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { api } from '../helpers/api.js';
import { asAdmin, asProjectManager, asProjectMember, asNonMember, loginAs } from '../helpers/auth.js';
import { resetDb } from '../helpers/resetDb.js';
import * as adminService from '../../src/modules/admin/admin.service.js';
import type { AuthUser } from '../../src/middleware/authenticate.js';

let client: pg.Client;

beforeAll(async () => {
  // This file creates/promotes/demotes users — start from a known-clean seed.
  await resetDb();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await resetDb();
});

async function anySeededEmail(): Promise<string> {
  const { rows } = await client.query<{ email: string }>('SELECT email FROM users ORDER BY id LIMIT 1');
  return rows[0]!.email;
}

async function anyDepartmentId(): Promise<number> {
  const { rows } = await client.query<{ id: number }>('SELECT id FROM departments ORDER BY id LIMIT 1');
  return rows[0]!.id;
}

async function currentVersion(userId: number): Promise<number> {
  const { rows } = await client.query<{ version: number }>('SELECT version FROM users WHERE id = $1', [userId]);
  return rows[0]!.version;
}

// asNonMember() only guarantees non-membership on asProjectManager()'s one
// fixture project — the "PM manage scope" rule spans *every* project that
// PM manages, and in this seed data a PM's several projects' members
// together cover every contributor. So this query finds a PM and a
// contributor who is outside ALL of that PM's managed projects, which is
// what the scoping rule actually needs to be tested against.
async function findPmWithUnrelatedContributor(): Promise<{
  pmEmail: string;
  memberId: number;
  unrelatedId: number;
  unrelatedEmail: string;
}> {
  const managedProjects = `
    SELECT id FROM projects WHERE owner_id = pm_user.id
    UNION
    SELECT project_id FROM project_members WHERE user_id = pm_user.id AND member_role = 'manager'
  `;
  const { rows } = await client.query<{
    pm_email: string;
    member_id: number;
    unrelated_id: number;
    unrelated_email: string;
  }>(
    `SELECT pm_user.email AS pm_email, mem.user_id AS member_id, nonmem.id AS unrelated_id, nonmem.email AS unrelated_email
     FROM users pm_user
     JOIN LATERAL (
       SELECT DISTINCT pm2.user_id
       FROM project_members pm2
       WHERE pm2.project_id IN (${managedProjects}) AND pm2.user_id <> pm_user.id
       LIMIT 1
     ) mem ON true
     JOIN LATERAL (
       SELECT c.id, c.email
       FROM users c
       WHERE c.role = 'contributor'
         AND c.id NOT IN (SELECT pm2.user_id FROM project_members pm2 WHERE pm2.project_id IN (${managedProjects}))
       LIMIT 1
     ) nonmem ON true
     WHERE pm_user.role = 'project_manager'
     ORDER BY pm_user.id
     LIMIT 1`,
  );
  if (!rows[0]) throw new Error('No PM with a cross-project unrelated contributor found in seed data');
  return {
    pmEmail: rows[0].pm_email,
    memberId: rows[0].member_id,
    unrelatedId: rows[0].unrelated_id,
    unrelatedEmail: rows[0].unrelated_email,
  };
}

describe('admin routes require the admin role', () => {
  test('contributor gets 403 on POST/PATCH/GET admin routes', async () => {
    const contributor = await asProjectMember();
    const departmentId = await anyDepartmentId();

    const create = await contributor.agent
      .post('/api/v1/admin/users')
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'nobody@ppfc.demo', fullName: 'Nobody', role: 'contributor', departmentId, password: 'Abcd1234' });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('FORBIDDEN');

    const patch = await contributor.agent
      .patch(`/api/v1/admin/users/${contributor.user.id}`)
      .send({ fullName: 'x', version: 1 });
    expect(patch.status).toBe(403);

    const audit = await contributor.agent.get('/api/v1/admin/audit-events');
    expect(audit.status).toBe(403);
  });

  test('project manager gets 403 on POST/PATCH/GET admin routes', async () => {
    const pm = await asProjectManager();
    const departmentId = await anyDepartmentId();

    const create = await pm.agent
      .post('/api/v1/admin/users')
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'nobody2@ppfc.demo', fullName: 'Nobody', role: 'contributor', departmentId, password: 'Abcd1234' });
    expect(create.status).toBe(403);

    const patch = await pm.agent.patch(`/api/v1/admin/users/${pm.user.id}`).send({ fullName: 'x', version: 1 });
    expect(patch.status).toBe(403);

    const audit = await pm.agent.get('/api/v1/admin/audit-events');
    expect(audit.status).toBe(403);
  });
});

describe('POST /api/v1/admin/users', () => {
  test('admin creates a user: 201, new user can log in, audit row matches the request id', async () => {
    const admin = await asAdmin();
    const departmentId = await anyDepartmentId();
    const email = `new.hire.${randomUUID()}@ppfc.demo`;

    const res = await admin.agent
      .post('/api/v1/admin/users')
      .set('Idempotency-Key', randomUUID())
      .send({ email, fullName: 'New Hire', role: 'contributor', departmentId, password: 'Abcd1234' });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email, fullName: 'New Hire', role: 'contributor' });
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash/);

    const login = await api().post('/api/v1/auth/login').send({ email, password: 'Abcd1234' });
    expect(login.status).toBe(200);

    const requestId = res.headers['x-request-id'];
    const { rows } = await client.query(
      `SELECT * FROM audit_events WHERE action = 'user.create' AND entity_id = $1`,
      [res.body.data.id],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].request_id).toBe(requestId);
  });

  test('duplicate email returns 409', async () => {
    const admin = await asAdmin();
    const departmentId = await anyDepartmentId();
    const existingEmail = await anySeededEmail();

    const res = await admin.agent
      .post('/api/v1/admin/users')
      .set('Idempotency-Key', randomUUID())
      .send({ email: existingEmail, fullName: 'Dup', role: 'contributor', departmentId, password: 'Abcd1234' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  test('weak password fails validation', async () => {
    const admin = await asAdmin();
    const departmentId = await anyDepartmentId();

    const res = await admin.agent
      .post('/api/v1/admin/users')
      .set('Idempotency-Key', randomUUID())
      .send({ email: `weak.${randomUUID()}@ppfc.demo`, fullName: 'Weak', role: 'contributor', departmentId, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/admin/users/:id', () => {
  test('promoting a contributor to project_manager takes effect on their next request without re-login', async () => {
    const admin = await asAdmin();
    const departmentId = await anyDepartmentId();
    const email = `promotee.${randomUUID()}@ppfc.demo`;

    // A dedicated user, not the shared asProjectMember() fixture — other
    // describe blocks in this file rely on that fixture staying a
    // contributor for the whole run.
    const created = await admin.agent
      .post('/api/v1/admin/users')
      .set('Idempotency-Key', randomUUID())
      .send({ email, fullName: 'Promotee', role: 'contributor', departmentId, password: 'Abcd1234' });
    expect(created.status).toBe(201);

    const promotee = await loginAs(email, 'Abcd1234'); // logs in BEFORE the promotion

    const patch = await admin.agent
      .patch(`/api/v1/admin/users/${promotee.user.id}`)
      .send({ role: 'project_manager', version: created.body.data.version });
    expect(patch.status).toBe(200);
    expect(patch.body.data.role).toBe('project_manager');

    // Same token as before the promotion — authenticate() re-reads role from
    // the DB on every request, so this PM-only route now succeeds.
    const res = await api().get('/api/v1/users').set('Authorization', `Bearer ${promotee.token}`);
    expect(res.status).toBe(200);
  });

  test('admin changing their own role returns 422', async () => {
    const admin = await asAdmin();
    const version = await currentVersion(admin.user.id);

    const res = await admin.agent.patch(`/api/v1/admin/users/${admin.user.id}`).send({ role: 'project_manager', version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('admin deactivating themselves returns 422', async () => {
    const admin = await asAdmin();
    const version = await currentVersion(admin.user.id);

    const res = await admin.agent.patch(`/api/v1/admin/users/${admin.user.id}`).send({ isActive: false, version });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  test('stale version returns 409 VERSION_CONFLICT', async () => {
    const admin = await asAdmin();
    const nonMember = await asNonMember();
    const staleVersion = await currentVersion(nonMember.user.id);

    const first = await admin.agent
      .patch(`/api/v1/admin/users/${nonMember.user.id}`)
      .send({ fullName: 'Renamed Once', version: staleVersion });
    expect(first.status).toBe(200);

    const second = await admin.agent
      .patch(`/api/v1/admin/users/${nonMember.user.id}`)
      .send({ fullName: 'Renamed Twice', version: staleVersion });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VERSION_CONFLICT');
  });

  // The last-active-admin guard can only ever be reached by a *different*
  // actor than the target: the HTTP route requires the caller to already be
  // an active admin (requireRole + authenticate), so a self-targeted call
  // always hits the self-check above first, and a same-actor count can
  // never drop to zero. This calls the service directly (bypassing the
  // admin-role HTTP gate, which is already covered above) to exercise the
  // guard itself with a real but distinct actor.
  test('cannot demote or deactivate the last active admin (service-level guard)', async () => {
    const pm = await asProjectManager();
    const admin = await asAdmin();
    const version = await currentVersion(admin.user.id);

    await expect(
      adminService.updateUser(pm.user as unknown as AuthUser, admin.user.id, { isActive: false, version }, randomUUID()),
    ).rejects.toMatchObject({ status: 422, code: 'BUSINESS_RULE' });
  });
});

describe('GET /api/v1/users', () => {
  test('contributor is forbidden', async () => {
    const contributor = await asProjectMember();
    const res = await contributor.agent.get('/api/v1/users');
    expect(res.status).toBe(403);
  });

  test('project manager sees only users on projects they manage', async () => {
    const { pmEmail, memberId, unrelatedId } = await findPmWithUnrelatedContributor();
    const pm = await loginAs(pmEmail);

    const res = await pm.agent.get('/api/v1/users').query({ pageSize: 100 });
    expect(res.status).toBe(200);

    const ids = res.body.data.map((u: { id: number }) => u.id);
    expect(ids).toContain(memberId);
    expect(ids).not.toContain(unrelatedId);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash/);
  });

  test('GET /users/:id for a user outside the PM scope returns 404', async () => {
    const { pmEmail, unrelatedId } = await findPmWithUnrelatedContributor();
    const pm = await loginAs(pmEmail);

    const res = await pm.agent.get(`/api/v1/users/${unrelatedId}`);
    expect(res.status).toBe(404);
  });

  test('admin sees any user by id', async () => {
    const admin = await asAdmin();
    const nonMember = await asNonMember();

    const res = await admin.agent.get(`/api/v1/users/${nonMember.user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(nonMember.user.id);
  });
});

describe('GET /api/v1/departments', () => {
  test('any authenticated role can list departments', async () => {
    const contributor = await asProjectMember();
    const res = await contributor.agent.get('/api/v1/departments');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('GET /api/v1/admin/audit-events', () => {
  test('filters by entityType and date range, and never includes password_hash', async () => {
    const admin = await asAdmin();
    const today = new Date().toISOString().slice(0, 10);

    const res = await admin.agent.get('/api/v1/admin/audit-events').query({
      entityType: 'user',
      from: today,
      to: today,
      pageSize: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const event of res.body.data) {
      expect(event.entityType).toBe('user');
    }
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash/);
  });
});

describe('GET /api/v1/projects/:projectId/activity', () => {
  test('a project member can view activity; a non-member gets 404', async () => {
    const pm = await asProjectManager();
    const member = await asProjectMember();
    const nonMember = await asNonMember();

    const visible = await member.agent.get(`/api/v1/projects/${pm.projectId}/activity`);
    expect(visible.status).toBe(200);

    const blocked = await nonMember.agent.get(`/api/v1/projects/${pm.projectId}/activity`);
    expect(blocked.status).toBe(404);
  });
});
