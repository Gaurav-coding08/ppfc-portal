import type { Request, Response } from 'express';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';

// Minimal fakes — errorHandler only touches req.id and res.status/json.
function fakeReq(): Request {
  return { id: 'req-123' } as unknown as Request;
}

function fakeRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('errorHandler', () => {
  it('maps a ZodError to 400 VALIDATION_ERROR', () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({ name: 123 });
    if (result.success) throw new Error('expected validation to fail');

    const req = fakeReq();
    const res = fakeRes();

    errorHandler(result.error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR', requestId: 'req-123' }),
      }),
    );
  });

  it('maps an unknown Error to 500 INTERNAL without leaking the stack', () => {
    const req = fakeReq();
    const res = fakeRes();

    errorHandler(new Error('boom, something internal broke'), req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const jsonMock = res.json as ReturnType<typeof vi.fn>;
    const body = jsonMock.mock.calls[0]?.[0];
    expect(body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('at ');
    expect(body.error).not.toHaveProperty('stack');
  });
});
