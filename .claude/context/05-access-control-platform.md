# 05 — Access control & shared platform helpers (done 2026-10-18)

## What exists now
Reusable building blocks for every business module: role guards (`requireRole`), project-scope
checks (`getProjectAccess`, `assertProjectAccess`, `scopedProjectIdsSql`), self-approval prevention
(`assertNotSelf`), idempotency middleware, optimistic-lock helper (`updateWithVersion`),
pagination/sort/filter parsing (`listQuery`, `toPageMeta`), date helper (`resolveAsOf`), and money
helper (`toMoney`). The audit writer now strips `password_hash`/`passwordHash` from before/after
payloads. `docs/security.md` contains the full role × action matrix.

## Files
- `backend/src/lib/access.ts` — `requireRole`, `getProjectAccess`, `assertProjectAccess`, `scopedProjectIdsSql`, `assertNotSelf`
- `backend/src/middleware/idempotency.ts` — `idempotent()` middleware for POST routes
- `backend/src/lib/versioning.ts` — `updateWithVersion(client, table, id, version, setSql, params)`
- `backend/src/lib/pagination.ts` — `listQuery({ sortable })`, `toPageMeta(query, total)`
- `backend/src/lib/dates.ts` — `resolveAsOf(query)`
- `backend/src/lib/money.ts` — `toMoney(numericString)`
- `backend/src/lib/audit.ts` — updated: now strips sensitive fields, accepts `Client | PoolClient`
- `backend/src/lib/errors.ts` — updated: `selfApproval` now returns 422, `versionConflict` accepts `details`
- `docs/security.md` — added role × action matrix, idempotency, optimistic locking, audit integrity sections
- `backend/tests/unit/access.test.ts` — 15 tests
- `backend/tests/integration/idempotency.test.ts` — 3 tests
- `backend/tests/unit/versioning.test.ts` — 3 tests
- `backend/tests/unit/pagination.test.ts` — 8 tests
- `backend/tests/unit/audit.test.ts` — 2 tests

## Database
No schema changes. Uses existing `idempotency_keys` table (PK `(key, user_id)`) from migration 003.

## Endpoints
No new endpoints (platform helpers only).

## Reusable pieces (use these, don't rebuild)
- `requireRole(...roles)` (`lib/access.ts`) — middleware, mount after `authenticate`; rejects with 403 FORBIDDEN
- `getProjectAccess(userId, role, projectId, client?)` (`lib/access.ts`) — returns `{ canView, canManage, isOwner, memberRole }` or null if project doesn't exist
- `assertProjectAccess(user, projectId, 'view'|'manage', client?)` (`lib/access.ts`) — throws 404 (out of scope / missing) or 403 (insufficient role)
- `scopedProjectIdsSql(user)` (`lib/access.ts`) — returns `{ sql, params }` fragment for list queries; admin gets empty SQL (no restriction)
- `assertNotSelf(actorId, requesterId)` (`lib/access.ts`) — throws 404 when IDs match (self-approval)
- `idempotent()` (`middleware/idempotency.ts`) — mount on POST routes after `authenticate`; requires `Idempotency-Key` header
- `updateWithVersion<T>(client, table, id, version, setSql, params)` (`lib/versioning.ts`) — optimistic-lock UPDATE; throws 404 or 409 with `{ currentVersion }`
- `listQuery({ sortable: string[] })` (`lib/pagination.ts`) — zod schema for list query params (page, pageSize, sort, order)
- `toPageMeta(query, total)` (`lib/pagination.ts`) — builds `{ page, pageSize, total }` meta object
- `resolveAsOf(query)` (`lib/dates.ts`) — returns validated `?asOf=YYYY-MM-DD` or env `REPORTING_DATE`
- `toMoney(numericString)` (`lib/money.ts`) — converts Postgres NUMERIC string to rounded JS number; returns null for null input
- `writeAudit(client, {...})` (`lib/audit.ts`) — now auto-strips `password_hash`/`passwordHash` from before/after

## Decisions & trade-offs
- **404 vs 403**: out-of-scope projects return 404, not 403, so non-members can't probe which project IDs exist. Only when the user *can* see the project but lacks the required level does it return 403.
- **Scope checked on loaded resource's project_id**: prevents ID-based escalation where a caller sends a resource ID belonging to another project. The resource is loaded first, its `project_id` is extracted, and only then is scope checked.
- **Idempotency key storage race**: two concurrent identical requests race to INSERT the key. The PK constraint `(key, user_id)` ensures exactly one INSERT wins; the other gets `ON CONFLICT DO NOTHING`, so the second request still returns the correct response — it just doesn't store a replay row. The comment in the code explains this.
- **Async idempotency storage**: the INSERT into `idempotency_keys` runs after `res.json()` to avoid blocking the response. A storage failure is swallowed — the client already got the right answer, and the next retry simply executes afresh.
- **`selfApproval` is 422**: CLAUDE.md says 422 for business-rule violations. Self-approval is a business rule, not an authorization failure, so it uses 422 SELF_APPROVAL_FORBIDDEN rather than 403.
- **`Client | PoolClient` in audit/access/versioning**: test files use raw `pg.Client` (not from the pool), so the function signatures accept both. The runtime always passes a `PoolClient` from `withTx`.
- **Money shape**: every response that includes monetary values should carry `currency: 'AED'` at the object level, not per field — documented in `lib/money.ts`.

## Known gaps / TODO for later features
- `assertNotSelf` throws 404 (reusing the "don't leak" pattern) rather than 422 `SELF_APPROVAL_FORBIDDEN` — business modules should use `selfApproval()` from `errors.ts` directly for the proper error code, and `assertNotSelf` is a convenience for cases where the semantics fit.
- `scopedProjectIdsSql` returns a SQL fragment starting with `AND` — callers must place it where an AND clause is syntactically valid (typically inside a WHERE that already has at least one condition).
- No business endpoints exist yet to exercise these helpers end-to-end — features 06+ will be the first real consumers.

## How to verify quickly
```
cd backend
npm run typecheck && npm run lint && npm test   # 99 tests pass
```
