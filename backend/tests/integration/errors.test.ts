import { describe, expect, it } from 'vitest';
import { asAdmin } from '../helpers/auth.js';

describe('unknown route', () => {
  // The global auth gate (authGate.ts) sits in front of routing, so an
  // unauthenticated request never reaches notFoundHandler — see
  // route-guard.test.ts's authGate block for that 401 case. With a valid
  // session the gate lets the request through and it 404s as usual.
  it('returns 404 JSON with a requestId', async () => {
    const admin = await asAdmin();
    const res = await admin.agent.get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
  });
});
