import { describe, expect, it } from 'vitest';
import { api } from '../helpers/api.js';

describe('GET /api/v1/health', () => {
  it('returns 200 with status/db up and a request id header', async () => {
    const res = await api().get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', db: 'up' } });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('echoes back an incoming x-request-id instead of generating a new one', async () => {
    const res = await api().get('/api/v1/health').set('x-request-id', 'test-fixed-id-123');

    expect(res.headers['x-request-id']).toBe('test-fixed-id-123');
  });
});
