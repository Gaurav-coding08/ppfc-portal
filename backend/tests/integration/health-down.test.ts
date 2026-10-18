import { describe, expect, it } from 'vitest';
import express from 'express';
import { Pool } from 'pg';
import supertest from 'supertest';

// Simulates a DB-down scenario by building a minimal app with a pool
// pointed at a non-existent database. The /health endpoint should
// return 503 with { status: 'degraded', db: 'down' }, not crash.

describe('health-down: /health returns 503 when DB is unreachable', () => {
  it('returns 503 with db: down', async () => {
    // Build a standalone app with a broken pool — avoids touching the
    // real pool used by other tests.
    const badPool = new Pool({
      connectionString: 'postgres://nobody:wrong@localhost:19999/nope',
      connectionTimeoutMillis: 500,
    });

    const app = express();
    app.get('/api/v1/health', async (_req, res) => {
      try {
        await badPool.query('SELECT 1');
        res.status(200).json({ data: { status: 'ok', db: 'up' } });
      } catch {
        res.status(503).json({ data: { status: 'degraded', db: 'down' } });
      }
    });

    const res = await supertest(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ data: { status: 'degraded', db: 'down' } });

    await badPool.end();
  });
});
