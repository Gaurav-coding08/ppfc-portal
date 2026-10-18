# 06 — Admin: departments, users, roles & audit (done 2026-10-18)

## What exists now
Reference-data and directory endpoints (`departments`, scoped `users`), admin-only user
management (create, role/status update with optimistic locking), and audit/activity review
(`admin/audit-events`, `projects/:id/activity`). Every admin mutation is atomic with its
`audit_events` row via `withTx` + `writeAudit`.

## Files
- `backend/src/modules/users/{users.schemas,users.repository,users.service,users.controller,users.routes}.ts` — departments list, scoped user list/detail
- `backend/src/modules/admin/{admin.schemas,admin.repository,admin.service,admin.controller,admin.routes}.ts` — user create/update, audit events, project activity
- `backend/db/migrations/011_audit_indexes.sql` — indexes on `audit_events(actor_id)` and `audit_events(project_id)` for the new filtered queries
- `backend/tests/integration/admin.test.ts` — 17 tests
- `docs/api-routes.md`, `docs/security.md` — new endpoint rows + two new sections (user directory scope, last-active-admin guard)

## Database
- Migration 011: `idx_audit_actor_id`, `idx_audit_project_id` on `audit_events`. No table/column changes.

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/departments | any | List all. |
| GET | /api/v1/users | PM, admin | Scoped: PM sees only users on projects they manage (union across all such projects). |
| GET | /api/v1/users/:id | PM (scoped), admin | Out of PM's scope → 404. |
| POST | /api/v1/admin/users | admin | Duplicate email → 409 `IDEMPOTENCY_CONFLICT`. Weak password → 400. Audited `user.create`. |
| PATCH | /api/v1/admin/users/:id | admin | `version` required (optimistic lock). Self role/deactivate → 422. Last-active-admin guard → 422. Audited `user.update`. |
| GET | /api/v1/admin/audit-events | admin | Filterable, newest first, includes actor name. |
| GET | /api/v1/projects/:projectId/activity | project view access | Reuses `assertProjectAccess`, not admin-gated. |

## Reusable pieces (use these, don't rebuild)
- `usersRepo.listUsers(filters, managerScopeUserId)` / `findUserById(id, managerScopeUserId)` — `managerScopeUserId: null` means no restriction (admin); pass a PM's id to scope to projects they manage
- `adminRepo.toAdminUser(rawRow)` — maps a raw `users` row (snake_case, may include `password_hash`) to the public `AdminUserRow` shape; use this instead of hand-rolling the mapping after any raw `users` query in this module
- `adminRepo.countActiveAdmins(client)` — the only place that counts active admins; reuse rather than re-querying
- `updateWithVersion<RawUserRow>(...)` pattern for any future `users` PATCH — see `admin.service.ts#updateUser` for the "load → business checks → build setSql → updateWithVersion → writeAudit" shape to copy for other entities

## Decisions & trade-offs
- **PM user-visibility scope is a union across every project the PM manages**, not just one —
  found via a seed-data test failure: `asNonMember()` (a feature 05 fixture) only guarantees
  non-membership on *one* project, but a PM here typically owns 2–3 projects whose combined
  membership covers every contributor in the dataset. The test now queries for a PM/contributor
  pair with genuinely no overlap across *all* of that PM's managed projects, rather than reusing
  the single-project fixture.
- **PATCH body's `version` is required**, not optional, despite the feature file writing
  `version?`. CLAUDE.md's optimistic-locking rule is blanket for every mutable entity; the `?` in
  the spec reads as shorthand for "this whole body is a partial update," not a deliberate
  exception for the concurrency token. Documented here in case a later feature file uses the same
  shorthand and should be read the same way.
- **Last-active-admin guard is structurally only reachable for actor ≠ target**: the HTTP route
  requires the caller to already be an active admin, so a same-actor update can never be the one
  that drops the count to zero — that case is caught first, unconditionally, by the separate
  self-role/deactivate check. Tested via a direct `adminService.updateUser()` call (bypassing the
  HTTP role gate, which is already covered elsewhere) with a real, distinct actor.
- **Duplicate email → 409 `IDEMPOTENCY_CONFLICT`**: CLAUDE.md's fixed error-code list has no
  `DUPLICATE`/`CONFLICT` code; `IDEMPOTENCY_CONFLICT` is the only generic 409 the existing
  `conflict()` helper produces, and the DB's unique index would map to the same code anyway via
  `errorHandler`'s `23505` branch if the pre-check ever lost a race.
- **`departments` and the project-activity route live in the `users`/`admin` modules** (two
  routers each) rather than new module folders, per the feature file's own module-scope line;
  mounted at their own base paths (`/api/v1/departments`, `/api/v1/projects`) in `app.ts`.
- Admin create/update never selects or returns `password_hash` at the SQL level (not just
  stripped after the fact) — `RETURNING`/`SELECT` column lists are explicit everywhere in this
  module.

## Known gaps / TODO for later features
- No department CRUD (create/rename) — out of scope per the feature file; `departments` is
  read-only reference data for now.
- `GET /users` sort is a fixed camelCase enum (`fullName`, `email`, `role`, `createdAt`) mapped to
  columns in the repository, not a free-text field — fine for now, revisit if a later feature
  needs sorting by a field not in that list.

## How to verify quickly
```
cd backend
npm run typecheck && npm run lint && npm test   # 117 tests pass
```
