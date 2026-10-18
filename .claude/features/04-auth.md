# 04 — Authentication

## Goal
Real sign-in for seeded demo users with secure session handling. No role selector, no fake buttons: every protected route resolves the user from a verified token and re-reads their current role from the DB.

## Depends on
03-synthetic-data

## Spec references
Assignment 2 §3.4 (secure sign-in, unsafe tokens, insecure cookies, CORS), §2 module 07.

## Scope

### Middleware
- `middleware/validate.ts`: `validate({ body?, query?, params? })` using zod; replaces `req.body/query/params` with parsed values; ZodError → central handler (400).
- `middleware/authenticate.ts`: token from cookie `ppfc_token` **or** `Authorization: Bearer`; verify with `JWT_SECRET` (HS256, explicit `algorithms: ['HS256']`); load user by id from DB (`is_active = true`) and attach `req.user = { id, email, fullName, role, departmentId }`. Missing/invalid/expired → 401 `UNAUTHENTICATED`. Role is read from DB each request so demotion takes effect immediately.
- `middleware/rateLimit.ts`: login limiter 10 req / 15 min per IP (429 `RATE_LIMITED`); skip in `NODE_ENV=test` unless a test enables it.
- Type augmentation for `req.user` and `req.id`.

### Module `modules/auth/`
| Method | Path | Auth | Behaviour |
|---|---|---|---|
| POST | `/api/v1/auth/login` | none | body `{ email, password }`; case-insensitive email; bcrypt compare; same 401 message for unknown email and wrong password (no user enumeration); sets httpOnly cookie (`sameSite: 'lax'`, `secure: COOKIE_SECURE`, `maxAge` from `JWT_EXPIRES_IN`) **and** returns `{ data: { user, token } }` (token for API tools/tests). Writes `audit_events` action `login.success` / `login.failure` (failure with actor null, entity_type `user`, entity_id of user if known else 0). |
| GET | `/api/v1/auth/me` | any | `{ data: { user, memberships: [{ projectId, projectCode, memberRole }] } }` |
| POST | `/api/v1/auth/logout` | any | clears cookie, 204 |

- JWT payload: `{ sub: userId }` only — no role in token (avoids stale-role escalation). Expiry from env.
- Constant-time-ish behaviour: when the email is unknown, still run a bcrypt compare against a dummy hash.

### Test helpers
- `tests/helpers/auth.ts`: `loginAs(email)` → returns `{ token, agent }`; `as(role)` shortcuts that pick seeded users by role (admin, a PM who owns a known project, a contributor who is a member of that project, a contributor who is **not** a member). Resolve those users by querying the test DB, not hard-coded IDs, and export them as named fixtures for later features.

### Docs
- `docs/security.md`: token storage (httpOnly cookie, why not localStorage), SameSite/secure flags, CORS allowlist + credentials, password hashing cost, no role in JWT, rate limiting, user-enumeration avoidance, secrets via env.
- Add routes to `docs/api-routes.md`.

## Tests (`integration/auth.test.ts`)
- Valid login → 200, cookie set with `HttpOnly`, token returned.
- Wrong password and unknown email → both 401 with identical message.
- `GET /auth/me` with cookie → user + memberships; with Bearer → same; without → 401; with tampered/expired token → 401.
- Deactivated user (set `is_active=false` in test) → 401 on `/me` even with a previously valid token.
- Logout clears cookie.
- Login writes an audit event.

## Acceptance
```
npm run typecheck && npm run lint && npm test
curl -i -X POST localhost:4000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"<admin from demo-accounts.md>","password":"Demo@1234"}'
```

## Out of scope
Role/permission checks per resource (05). User admin (06).

## Interview talking points
Why role isn't in the JWT; cookie vs bearer trade-off; how CORS + SameSite work together; why identical error messages; how you'd swap in an identity provider (Entra ID/Auth0) behind the same `authenticate` middleware.
