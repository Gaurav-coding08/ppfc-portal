import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { badRequest, conflict } from '../lib/errors.js';

// Idempotency middleware for mutating POST routes (cost posting, CR
// decisions, budget-revision decisions). Requires an `Idempotency-Key`
// header. On duplicate submission by the same user:
//   - completed with same method+path → replay stored response (header: idempotent-replay: true)
//   - completed with different path   → 409 IDEMPOTENCY_CONFLICT
//   - still in progress               → 409 IDEMPOTENCY_CONFLICT (concurrent duplicate)
//
// The key is reserved (INSERT with NULL response_status) *before* the
// handler runs. This closes the race window where two concurrent POSTs
// with the same key both pass a SELECT-then-INSERT check and both
// execute the handler. The PK (key, user_id) ensures exactly one
// INSERT wins; the loser gets a unique_violation and returns 409.
// On handler success the reservation is UPDATEd with the response;
// on handler error the reservation is DELETEd so a retry gets a
// fresh attempt.
export function idempotent() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = req.header('idempotency-key');
      if (!key) {
        throw badRequest('Idempotency-Key header is required');
      }

      const userId = req.user!.id;
      const method = req.method;
      const path = req.originalUrl;

      const { rows: existing } = await pool.query<{
        method: string;
        path: string;
        response_status: number | null;
        response_body: unknown;
      }>(
        `SELECT method, path, response_status, response_body
         FROM idempotency_keys
         WHERE key = $1 AND user_id = $2`,
        [key, userId],
      );

      if (existing.length > 0) {
        const row = existing[0]!;

        if (row.response_status === null) {
          throw conflict('A request with this idempotency key is already in progress');
        }

        if (row.method !== method || row.path !== path) {
          throw conflict('Idempotency key already used for a different request', {
            existingMethod: row.method,
            existingPath: row.path,
          });
        }

        res.setHeader('idempotent-replay', 'true');
        res.status(row.response_status).json(row.response_body);
        return;
      }

      // Reserve the key before running the handler. A concurrent request
      // with the same key will hit the PK constraint and fail here.
      try {
        await pool.query(
          `INSERT INTO idempotency_keys (key, user_id, method, path, response_status, response_body)
           VALUES ($1, $2, $3, $4, NULL, NULL)`,
          [key, userId, method, path],
        );
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
          throw conflict('A request with this idempotency key is already in progress');
        }
        throw err;
      }

      // Intercept res.json to capture the response and finalize the
      // reservation. On a non-2xx the reservation is deleted so the
      // client can retry.
      const originalJson = res.json.bind(res);
      res.json = function captureAndStore(body: unknown) {
        const status = res.statusCode;

        if (status >= 200 && status < 300) {
          pool
            .query(
              `UPDATE idempotency_keys
               SET response_status = $1, response_body = $2
               WHERE key = $3 AND user_id = $4`,
              [status, JSON.stringify(body), key, userId],
            )
            .catch(() => {
              // Update failure is non-fatal — the client already got the
              // correct response. The reservation row stays with NULL
              // status and will block retries until it's cleaned up.
            });
        } else {
          pool
            .query(
              `DELETE FROM idempotency_keys WHERE key = $1 AND user_id = $2 AND response_status IS NULL`,
              [key, userId],
            )
            .catch(() => {});
        }

        return originalJson(body);
      };

      // If the handler throws (AppError or unexpected), clean up the
      // reservation so the key is available for retry.
      const originalNext = next;
      next = ((err?: unknown) => {
        if (err) {
          pool
            .query(
              `DELETE FROM idempotency_keys WHERE key = $1 AND user_id = $2 AND response_status IS NULL`,
              [key, userId],
            )
            .catch(() => {});
        }
        originalNext(err);
      }) as NextFunction;

      next();
    } catch (err) {
      next(err);
    }
  };
}
