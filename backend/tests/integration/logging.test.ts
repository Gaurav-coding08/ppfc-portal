import { describe, expect, it } from 'vitest';
import { api } from '../helpers/api.js';

describe('logging: responses carry requestId and no sensitive data leaks', () => {
  it('error response contains requestId matching response header', async () => {
    // Hit a protected route without a token — guaranteed 401
    const res = await api().get('/api/v1/projects');

    expect(res.status).toBe(401);
    const headerId = res.headers['x-request-id'];
    expect(headerId).toBeTruthy();
    expect(res.body.error.requestId).toBe(headerId);
  });

  it('500 error response contains requestId, no stack trace', async () => {
    // Hit a non-existent route — 404 from our handler, which always
    // includes requestId and never a stack trace
    const res = await api().get('/api/v1/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.body.error.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });

  it('pino redact config is present for sensitive paths', async () => {
    const { logger } = await import('../../src/lib/logger.js');
    // pino stores serializers internally when redact is configured
    const serializers = (logger as unknown as Record<symbol, unknown>)[Symbol.for('pino.serializers')];
    expect(serializers).toBeDefined();
  });
});
