import { describe, expect, it } from 'vitest';
import { ApiError, toApiError } from './errors';

describe('toApiError', () => {
  it('parses the backend error shape { error: { code, message, details, requestId } }', () => {
    const body = {
      error: {
        code: 'VERSION_CONFLICT',
        message: 'Resource was modified by someone else',
        details: { currentVersion: 4 },
        requestId: 'req-abc-123',
      },
    };
    const response = new Response(null, { status: 409 });
    const err = toApiError(body, response);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('VERSION_CONFLICT');
    expect(err.message).toBe('Resource was modified by someone else');
    expect(err.details).toEqual({ currentVersion: 4 });
    expect(err.requestId).toBe('req-abc-123');
  });

  it('falls back to a generic message and INTERNAL code when the body does not match the shape', () => {
    const response = new Response(null, { status: 502 });
    const err = toApiError(undefined, response);

    expect(err.status).toBe(502);
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('Something went wrong. Please try again.');
  });

  it('falls back to the x-request-id response header when the body has no requestId', () => {
    const response = new Response(null, { status: 500, headers: { 'x-request-id': 'header-req-id' } });
    const err = toApiError({ error: { code: 'INTERNAL', message: 'Boom' } }, response);

    expect(err.requestId).toBe('header-req-id');
  });
});
