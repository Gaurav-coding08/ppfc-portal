# 05 — Access control & shared platform helpers

## Goal
The reusable building blocks every business module will use, so later features stay small and consistent: role guards, project-scope checks, audit writer, idempotency, optimistic-lock helper, pagination/sort/filter parsing, and date/money helpers.

## Depends on
04-auth

## Spec references
Assignment 2 §3.4 (authorize every route, prevent cross-project / ID-based escalation), §3.2 (transaction integrity), §3.5 (concurrency, double submissions), §4 (controls and audit).

## Scope

### `lib/access.ts`
- `requireRole(...roles)` middleware → 403 `FORBIDDEN`.
- `getProjectAccess(userId, role, projectId, client?)` → `{ canView, canManage, isOwner, memberRole }` (single SQL query over projects + project_members). Rules exactly as in CLAUDE.md.
- `assertProjectAccess(user, projectId, level: 'view' | 'manage', client?)`:
  - project missing **or** `!canView` → 404 `NOT_FOUND` (don't leak existence).
  - `level = 'manage'` and `!canManage` → 403 `FORBIDDEN`.
- `scopedProjectIdsSql(user)` → returns a SQL fragment + params (`project_id = ANY($n)` or a sub-select) for list/aggregate queries; admin = no restriction. Used by every list endpoint and the dashboard.
- `assertNotSelf(actorId, requesterId)` → 422 `SELF_APPROVAL_FORBIDDEN`.

### `lib/audit.ts`
- `writeAudit(client, { actorId, entityType, entityId, action, projectId?, before?, after?, requestId })` — **requires** a client (forces use inside `withTx`). Strip `password_hash` from before/after.

### `middleware/idempotency.ts`
- `idempotent()` for POST routes: requires `Idempotency-Key` header (400 if missing on routes that use it). Lookup `(key, user_id)`:
  - found with same method+path → replay stored status/body, header `idempotent-replay: true`.
  - found with different path → 409 `IDEMPOTENCY_CONFLICT`.
  - not found → run handler; capture the final status/body; store only for 2xx responses (`INSERT ... ON CONFLICT DO NOTHING`). Comment the race window and why the DB primary key closes it.

### `lib/versioning.ts`
- `updateWithVersion(client, table, id, version, setSql, params)` helper or documented pattern: `UPDATE ... SET ..., version = version + 1, updated_at = now() WHERE id = $ AND version = $ RETURNING *`; 0 rows → re-check existence → 404 or 409 `VERSION_CONFLICT` with `details: { currentVersion }`.

### `lib/pagination.ts`
- zod schema `listQuery({ sortable: [...] })` → `{ page, pageSize, sort, order }` with whitelist-only sort columns (never interpolate unchecked identifiers) and `toPageMeta(total)`.

### `lib/dates.ts`, `lib/money.ts`
- `resolveAsOf(query)` → `?asOf=YYYY-MM-DD` validated, else `fn_reporting_date()` / env `REPORTING_DATE`.
- `toMoney(numericString | null)` → number rounded to 2 dp (or null). Money objects carry a single `currency: 'AED'` field at object level, not per amount. Record this shape in the context file so every later module returns money identically.

### Policy matrix doc
- `docs/security.md` → add the full **role × action matrix** (rows: view project, manage project, create task, update own task progress, update any task, manage milestones/risks, submit CR, decide CR, create draft cost, post cost, request budget revision, decide budget revision, manage categories, manage users, view audit). Later features must comply with it.

## Tests
- `unit/access.test.ts` (DB-backed via fixtures from 04): admin → view+manage any project; owner PM → manage own; PM on unrelated project → 404 on view; member contributor → view yes, manage 403; non-member contributor → 404.
- `integration/idempotency.test.ts`: mount a tiny test-only route in the test (e.g. via `buildApp({ extraRoutes })` option or a router registered only when `NODE_ENV=test`) that inserts a row; same key twice → one row, second response replayed with header; missing key → 400.
- `unit/versioning.test.ts`: stale version → 409 with currentVersion; correct version increments.
- `unit/pagination.test.ts`: unknown sort column rejected; pageSize capped at 100.
- `unit/audit.test.ts`: audit written in a rolled-back transaction leaves no row.

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Out of scope
Business endpoints.

## Interview talking points
404 vs 403 choice; why scope is checked on the **loaded resource's** project_id (prevents ID-based escalation); how idempotency prevents double posting; optimistic vs pessimistic locking trade-off; why audit must share the transaction client.
