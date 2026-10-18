import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { badRequest, conflict } from '../lib/errors.js';

// Idempotency middleware for mutating POST routes (cost posting, CR
// decisions, budget-revision decisions). Requires an `Idempotency-Key`
// header. On duplicate submission by the same user:
//   - same method+path → replay the stored response (header: idempotent-replay: true)
//   - different path → 409 IDEMPOTENCY_CONFLICT
// Only 2xx responses are stored — errors are not replayed, so a retry
// after a transient failure gets a fresh attempt.
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

      const { rows } = await pool.query<{
        method: string;
        path: string;
        response_status: number;
        response_body: unknown;
      }>(
        `SELECT method, path, response_status, response_body
         FROM idempotency_keys
         WHERE key = $1 AND user_id = $2`,
        [key, userId],
      );

      if (rows.length > 0) {
        const existing = rows[0]!;
        if (existing.method !== method || existing.path !== path) {
          throw conflict('Idempotency key already used for a different request', {
            existingMethod: existing.method,
            existingPath: existing.path,
          });
        }

        res.setHeader('idempotent-replay', 'true');
        res.status(existing.response_status).json(existing.response_body);
        return;
      }

      // Intercept res.json to capture the response for storage. The original
      // json method is called after we INSERT, so the client always sees the
      // real response — even if the INSERT races with a concurrent identical
      // request: the PK (key, user_id) ensures exactly one wins the INSERT
      // and the other gets a unique_violation which we swallow via ON CONFLICT
      // DO NOTHING.
      const originalJson = res.json.bind(res);
      res.json = function captureAndStore(body: unknown) {
        const status = res.statusCode;

        if (status >= 200 && status < 300) {
          pool
            .query(
              `INSERT INTO idempotency_keys (key, user_id, method, path, response_status, response_body)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT DO NOTHING`,
              [key, userId, method, path, status, JSON.stringify(body)],
            )
            .catch(() => {
              // Storage failure doesn't block the response — the client
              // already got the correct result, and the next retry will
              // simply execute afresh (no stored row to replay).
            });
        }

        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
