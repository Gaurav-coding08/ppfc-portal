import jwt from 'jsonwebtoken';
import pg from 'pg';
import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { env } from '../../src/config/env.js';
import { api } from '../helpers/api.js';
import { asAdmin, asProjectMember, loginAs } from '../helpers/auth.js';
import { resetDb } from '../helpers/resetDb.js';
import { DEMO_PASSWORD } from '../../scripts/generate/users.js';

let client: pg.Client;

beforeAll(async () => {
  // This file deactivates a user mid-suite — start from a known-clean seed.
  await resetDb();
  client = new pg.Client({ connectionString: process.env.DATABASE_URL_TEST });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  // Leave the seed data clean for any test file that runs after this one.
  await resetDb();
});

async function getSeededEmail(role: 'admin' | 'project_manager' | 'contributor'): Promise<string> {
  const { rows } = await client.query<{ email: string }>(
    'SELECT email FROM users WHERE role = $1 ORDER BY id LIMIT 1',
    [role],
  );
  if (!rows[0]) throw new Error(`No seeded ${role} user found`);
  return rows[0].email;
}

describe('POST /api/v1/auth/login', () => {
  test('valid credentials return 200, an httpOnly cookie, and a token', async () => {
    const email = await getSeededEmail('admin');
    const res = await api().post('/api/v1/auth/login').send({ email, password: DEMO_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTypeOf('string');
    expect(res.body.data.user).toMatchObject({ email, role: 'admin' });

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const authCookie = setCookie.find((c) => c.startsWith('ppfc_token='));
    expect(authCookie).toBeDefined();
    expect(authCookie).toMatch(/HttpOnly/i);
  });

  test('login is case-insensitive on email', async () => {
    const email = await getSeededEmail('admin');
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: email.toUpperCase(), password: DEMO_PASSWORD });

    expect(res.status).toBe(200);
  });

  test('wrong password and unknown email return the identical 401', async () => {
    const email = await getSeededEmail('contributor');

    const wrongPassword = await api().post('/api/v1/auth/login').send({ email, password: 'not-the-password' });
    const unknownEmail = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody-seeded@ppfc.demo', password: DEMO_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('UNAUTHENTICATED');
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  test('missing fields fail validation', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('writes an audit_events row for both success and failure', async () => {
    const email = await getSeededEmail('project_manager');

    await api().post('/api/v1/auth/login').send({ email, password: DEMO_PASSWORD });
    await api().post('/api/v1/auth/login').send({ email, password: 'wrong' });

    const { rows: successRows } = await client.query(
      `SELECT * FROM audit_events ae JOIN users u ON u.id = ae.actor_id
       WHERE ae.action = 'login.success' AND u.email = $1`,
      [email],
    );
    expect(successRows.length).toBeGreaterThanOrEqual(1);

    const { rows: failureRows } = await client.query(
      `SELECT * FROM audit_events WHERE action = 'login.failure' AND actor_id IS NULL`,
    );
    expect(failureRows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/auth/me', () => {
  test('returns the user and memberships with a cookie', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ role: 'admin' });
    expect(res.body.data.memberships).toEqual([]);
  });

  test('returns the same shape with a Bearer token', async () => {
    const admin = await asAdmin();
    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(admin.user.id);
  });

  test('includes memberships for a project member', async () => {
    const member = await asProjectMember();
    const res = await member.agent.get('/api/v1/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.data.memberships.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.memberships[0]).toHaveProperty('projectCode');
    expect(res.body.data.memberships[0]).toHaveProperty('memberRole');
  });

  test('without a token returns 401', async () => {
    const res = await api().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('a tampered token returns 401', async () => {
    const admin = await asAdmin();
    const tampered = admin.token.slice(0, -1) + (admin.token.endsWith('a') ? 'b' : 'a');

    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  test('an expired token returns 401', async () => {
    const admin = await asAdmin();
    const expired = jwt.sign(
      { sub: admin.user.id, exp: Math.floor(Date.now() / 1000) - 60 },
      env.JWT_SECRET,
      { algorithm: 'HS256' },
    );

    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  test('a deactivated user is rejected even with a previously valid token', async () => {
    const email = await getSeededEmail('contributor');
    const logged = await loginAs(email);

    await client.query('UPDATE users SET is_active = false WHERE email = $1', [email]);
    try {
      const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${logged.token}`);
      expect(res.status).toBe(401);
    } finally {
      await client.query('UPDATE users SET is_active = true WHERE email = $1', [email]);
    }
  });
});

describe('POST /api/v1/auth/logout', () => {
  test('clears the auth cookie', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.post('/api/v1/auth/logout');

    expect(res.status).toBe(204);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.find((c) => c.startsWith('ppfc_token='))).toMatch(/ppfc_token=;/);

    const afterLogout = await admin.agent.get('/api/v1/auth/me');
    expect(afterLogout.status).toBe(401);
  });
});
