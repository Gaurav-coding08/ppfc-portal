import { describe, expect, it, beforeAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';
import http from 'node:http';
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

function buildTestApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestId);
  app.use('/api/v1/test/idempotent', authenticate, idempotent(), (_req, res) => {
    res.status(201).json({ data: { created: true, key: _req.header('idempotency-key') } });
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

    // Wait briefly for the async UPDATE to finalize the reservation
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

  it('concurrent POSTs with the same key insert exactly one row', async () => {
    const tableName = `idem_race_${Date.now()}`;
    await pool.query(`CREATE TABLE ${tableName} (id SERIAL PRIMARY KEY, v TEXT)`);

    // The handler sleeps 200ms via pg_sleep so both requests enter the
    // middleware and race on the reservation INSERT before either handler
    // completes.
    const app = express();
    app.use(helmet());
    app.use(express.json());
    app.use(cookieParser());
    app.use(requestId);
    app.use('/api/v1/test/insert', authenticate, idempotent(), async (_req, res) => {
      await pool.query(`SELECT pg_sleep(0.2)`);
      await pool.query(`INSERT INTO ${tableName} (v) VALUES ('hit')`);
      res.status(201).json({ data: { inserted: true } });
    });
    app.use(errorHandler);

    // Use a single shared HTTP server so both requests hit the same
    // event loop, maximizing the chance of true concurrency.
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const key = randomUUID();

      const fire = () =>
        fetch(`http://127.0.0.1:${port}/api/v1/test/insert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${admin.token}`,
            'Idempotency-Key': key,
          },
          body: '{}',
        });

      const [r1, r2] = await Promise.all([fire(), fire()]);
      const statuses = [r1.status, r2.status].sort();

      // One succeeds (201), the other gets 409 (reservation conflict)
      expect(statuses).toEqual([201, 409]);

      // Wait for async UPDATE to finalize the stored response
      await new Promise((r) => setTimeout(r, 300));

      // Only one row should have been inserted by the handler
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*) FROM ${tableName}`,
      );
      expect(parseInt(rows[0]!.count, 10)).toBe(1);
    } finally {
      server.close();
      await pool.query(`DROP TABLE IF EXISTS ${tableName}`);
    }
  });
});
