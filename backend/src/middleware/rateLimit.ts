import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// Flipped by a test that specifically wants to exercise rate limiting;
// every other test run (NODE_ENV=test) skips the limiter so the hundreds
// of login calls across the suite never trip it.
let forceEnabledInTest = false;

export function _setLoginRateLimitForceEnabled(enabled: boolean): void {
  forceEnabledInTest = enabled;
}

// 10 attempts / 15 minutes per IP on login, per CLAUDE.md. Keyed by IP only
// (not email) so it can't be used to lock a known account out by hammering
// it from elsewhere.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test' && !forceEnabledInTest,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many login attempts. Try again later.',
        requestId: req.id,
      },
    });
  },
});
