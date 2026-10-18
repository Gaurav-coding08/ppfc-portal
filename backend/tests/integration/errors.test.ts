import { describe, expect, it } from 'vitest';
import { api } from '../helpers/api.js';

describe('unknown route', () => {
  it('returns 404 JSON with a requestId', async () => {
    const res = await api().get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
  });
});
