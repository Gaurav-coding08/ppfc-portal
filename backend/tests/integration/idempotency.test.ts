import { describe, expect, it, beforeAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import { randomUUID } from 'node:crypto';
import { authenticate } from '../../src/middleware/authenticate.js';
import { idempotent } from '../../src/middleware/idempotency.js';
import { requestId } from '../../src/middleware/requestId.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { pool } from '../../src/db/pool.js';
import { asAdmin } from '../helpers/auth.js';
import type { LoggedInUser } from '../helpers/auth.js';
import helmet from 'helmet';

let admin: LoggedInUser;

// Build a minimal test app with a POST route that uses the idempotency
// middleware and inserts a row into a temporary table.
function buildTestApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId);
  app.use('/api/v1/test/idempotent', authenticate, idempotent(), (req, res) => {
    res.status(201).json({ data: { created: true, key: req.header('idempotency-key') } });
  });
  app.use(errorHandler);
  return app;
}

beforeAll(async () => {
  admin = await asAdmin();
});

describe('idempotency middleware', () => {
  it('returns 400 when Idempotency-Key header is missing', async () => {
    const app = buildTestApp();
    const res = await supertest(app)
      .post('/api/v1/test/idempotent')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('Idempotency-Key');
  });

  it('executes the handler on first request and replays on second', async () => {
    const app = buildTestApp();
    const key = randomUUID();

    const res1 = await supertest(app)
      .post('/api/v1/test/idempotent')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', key)
      .send({});

    expect(res1.status).toBe(201);
    expect(res1.body.data.created).toBe(true);
    expect(res1.headers['idempotent-replay']).toBeUndefined();

    // Wait briefly for the async INSERT to complete
    await new Promise((r) => setTimeout(r, 100));

    const res2 = await supertest(app)
      .post('/api/v1/test/idempotent')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', key)
      .send({});

    expect(res2.status).toBe(201);
    expect(res2.body.data.created).toBe(true);
    expect(res2.headers['idempotent-replay']).toBe('true');
  });

  it('returns 409 when key is reused for a different path', async () => {
    const key = randomUUID();

    // First, store a key manually with a different path
    await pool.query(
      `INSERT INTO idempotency_keys (key, user_id, method, path, response_status, response_body)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [key, admin.user.id, 'POST', '/api/v1/other/route', 201, JSON.stringify({ ok: true })],
    );

    const app = buildTestApp();
    const res = await supertest(app)
      .post('/api/v1/test/idempotent')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Idempotency-Key', key)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
