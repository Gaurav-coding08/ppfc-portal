# 04 — Authentication (done 2026-10-18)

## What exists now
Real sign-in for seeded demo users: `POST /auth/login` verifies against bcrypt, writes an
audit event (success or failure) in the same transaction, and sets an httpOnly JWT cookie
(also returning the token in the body for API tools/tests). `authenticate` middleware resolves
`req.user` from that token on every protected request by re-reading the user's current role
and `is_active` flag from the DB — never from the token itself, so a role change or
deactivation takes effect immediately. `GET /auth/me` and `POST /auth/logout` are the first
protected routes. `validate.ts` (generic zod body/query/params) and `rateLimit.ts` (login
limiter) are now available for every future module/route.

## Files
- `backend/src/config/env.ts` — added `parseDurationMs` + `env.jwtExpiresInMs` (ms value for the cookie's `maxAge`, derived from `JWT_EXPIRES_IN`)
- `backend/src/db/pool.ts` — registers a `pg` type parser for OID 20 (int8/bigint) so every `id`/`*_id` column returns a JS `number`, not a string — see "Decisions & trade-offs"
- `backend/src/lib/audit.ts` — `writeAudit(client, {...})`, first real use of the CLAUDE.md audit pattern
- `backend/src/lib/asyncHandler.ts` — wraps an async controller so a rejected promise reaches `errorHandler` (Express 4 doesn't do this itself)
- `backend/src/middleware/validate.ts` — generic `validate({ body?, query?, params? })`
- `backend/src/middleware/authenticate.ts` — cookie-or-Bearer → JWT verify → `req.user`; `AuthUser` type + `Express.Request.user` augmentation
- `backend/src/middleware/rateLimit.ts` — `loginRateLimit` (10/15min/IP), `_setLoginRateLimitForceEnabled` test hook
- `backend/src/modules/auth/{auth.schemas,auth.repository,auth.service,auth.controller,auth.routes}.ts`
- `backend/tests/helpers/auth.ts` — `loginAs(email)`, plus DB-resolved fixtures `asAdmin`, `asProjectManager`, `asProjectMember`, `asNonMember` (memoized, queried not hard-coded)
- `backend/tests/integration/auth.test.ts` — 13 tests
- `backend/vitest.config.ts` — added `setupFiles: ['src/db/pool.ts']` so the bigint type parser is registered before any test file's own raw `pg.Client` queries run (see "Decisions & trade-offs")
- `docs/security.md`, `docs/api-routes.md` (auth rows added)
- `backend/package.json` — added `express-rate-limit` (already in CLAUDE.md's stack table, just not yet installed)

## Database
No schema changes. No new tables/columns.

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | /api/v1/auth/login | public | Rate-limited 10/15min/IP. Sets `ppfc_token` httpOnly cookie; `{ data: { user, token } }`. Identical 401 for unknown email / wrong password / deactivated account. |
| GET | /api/v1/auth/me | any authenticated | `{ data: { user, memberships } }` |
| POST | /api/v1/auth/logout | any authenticated | Clears cookie, 204 |

## Reusable pieces (use these, don't rebuild)
- `authenticate` (`middleware/authenticate.ts`) — mount on any route needing `req.user`; sets `AuthUser { id, email, fullName, role, departmentId }`
- `validate({ body?, query?, params? })` (`middleware/validate.ts`) — every future module's input validation
- `writeAudit(client, {...})` (`lib/audit.ts`) — call inside `withTx`, same client as the mutation
- `asyncHandler(fn)` (`lib/asyncHandler.ts`) — wrap every async controller passed to an Express route
- `loginRateLimit` / `_setLoginRateLimitForceEnabled` (`middleware/rateLimit.ts`) — pattern to copy for any other rate-limited route
- `findActiveUserById`, `findUserByEmail`, `findMembershipsByUserId` (`modules/auth/auth.repository.ts`) — feature 06 (admin/users) should extend this repository rather than duplicating user queries
- `tests/helpers/auth.ts`: `loginAs(email)`, `asAdmin()`, `asProjectManager()` (returns `projectId`/`projectCode` too), `asProjectMember()`, `asNonMember()` — feature 05 onward should use these for role/scope tests instead of hard-coding user ids or re-querying
- `env.jwtExpiresInMs` (`config/env.ts`) — ms form of `JWT_EXPIRES_IN`, for anything else that needs the same duration as a cookie `maxAge`

## Decisions & trade-offs
- **bigint-as-string fix, found while verifying this feature manually**: `pg` returns `BIGINT`
  columns as strings by default (same precision-safety reasoning as `NUMERIC`, documented in
  `pool.ts`'s existing comment — but that comment only covered money). Every `id`/`*_id` in this
  schema is `BIGINT GENERATED ALWAYS AS IDENTITY`, so until now every repository's `number`-typed
  id field was lying about its runtime type; it just never surfaced because no earlier feature
  returned a raw id through the API. Fixed by registering a type parser for OID 20 (int8) in
  `pool.ts`, safe because these ids are small sequential integers, nowhere near
  `Number.MAX_SAFE_INTEGER` — unlike money, which stays string-typed on purpose. Added
  `setupFiles: ['src/db/pool.ts']` to `vitest.config.ts` so this is registered before any test
  file's own raw `pg.Client` runs too (globalSetup runs in a separate process/context from the
  tests, so doing it there wouldn't reach the test-running worker).
- Login's audit write must commit even when the login itself fails (that's the whole point — a
  failed attempt is exactly what needs to be on record). So the `withTx` callback never throws for
  a bad password/unknown email/deactivated account: it writes the audit row and returns a
  `{ success: false }` marker, and only the caller (after the transaction has committed) throws
  `unauthenticated()`. Throwing inside the callback would have rolled back the very audit row the
  failure was supposed to produce.
- JWT payload is `{ sub: userId }` only, nothing else — see `docs/security.md` for why (role
  re-read from DB every request, not trusted from the token).
- `DUMMY_HASH` (a real bcrypt hash of an arbitrary string, computed once at module load) is
  compared against on every login where the email doesn't resolve, so an unknown-email request
  costs the same bcrypt work as a wrong-password one — closes a timing side channel that the
  identical error *message* alone doesn't close.
- `req.id` is typed by `@types/pino-http` as `ReqId` (`string | number | object`) because it
  augments `http.IncomingMessage` directly, which out-ranks this repo's own
  `Express.Request.id: string` augmentation in `middleware/requestId.ts`. Worked around with one
  documented cast (`req.id as string`) at the one call site that needs a strict `string`, rather
  than touching the global type declarations. It's always actually a string at runtime — nothing
  else ever assigns `req.id`.
- `validate.ts` reassigns `req.body` directly (typed `any` by Express) but uses `Object.assign`
  for `req.query`/`req.params` instead of reassigning them — a schema may coerce types (e.g.
  numbers for future pagination params) that wouldn't satisfy `ParsedQs`/`ParamsDictionary`'s
  string-keyed index signature under a direct reassignment in strict mode.
- `tests/helpers/auth.ts`'s fixtures resolve a single project that has both a contributor member
  and a contributor non-member, memoized per process — safe because `resetDb()` reloads the exact
  same deterministic CSVs every time, so the resolved ids never actually change within a run.

## Known gaps / TODO for later features
- `authorize.ts` (resource-scoped `canView`/`canManage`) is explicitly out of scope — feature 05.
- No refresh-token flow; a token simply expires after `JWT_EXPIRES_IN` (8h) and the user logs in
  again. Fine for an internal tool; would need revisiting for a public-facing one.
- `loginRateLimit`'s test-enable toggle (`_setLoginRateLimitForceEnabled`) exists but isn't
  exercised by a test in this feature — the feature spec's test list didn't require one, and
  flipping it on/off reliably across the shared rate-limit window would need careful isolation
  from the rest of the suite's login calls.

## How to verify quickly
```
cd backend
npm run typecheck && npm run lint && npm test   # 68 tests pass
npm run dev
curl -i -X POST localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"garnet.wiegand@ppfc.demo","password":"Demo@1234"}'
# → 200, Set-Cookie: ppfc_token=...; HttpOnly, body.data.user.id is a number
```
