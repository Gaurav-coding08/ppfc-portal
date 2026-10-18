# 07 — Projects & membership (done 2026-10-18)

## What exists now
Full project portfolio CRUD (`modules/projects/`): scoped list with filters/sort/pagination,
project detail (members, counts, progress, delivery status, budget headline), create (one
transaction: project + owner's `manager` membership + initial budget + audit), update
(optimistic lock, ownership transfer, completion guard), membership add/remove, and paginated
progress snapshots. A new SQL function `fn_project_delivery_status(asOf)` is the single source
of truth for the on_track/behind/at_risk/completed badge.

## Files
- `backend/db/migrations/012_project_delivery_status.sql` — `fn_project_delivery_status(p_as_of DATE)`
- `backend/src/modules/projects/projects.schemas.ts` — zod schemas for every endpoint
- `backend/src/modules/projects/projects.repository.ts` — list/read queries (`listProjects`, `findProjectSummaryById`, `findProjectRowById`, `nextProjectCode`)
- `backend/src/modules/projects/projects.mutations.repository.ts` — create/update writes (`insertProject`, `insertProjectBudget`, `findEligibleOwner`, `upsertMember`, `countOpenTasks`)
- `backend/src/modules/projects/projects.members.repository.ts` — member CRUD (`findMembers`, `findMemberRole`, `insertMember`, `removeMember`, `findActiveUser`)
- `backend/src/modules/projects/projects.detail.repository.ts` — detail-only reads (`findProjectCounts`, `findBudgetHeadline`, `findProgressSnapshots`)
- `backend/src/modules/projects/projects.shared.ts` — `viewScopeFor`, `isEligibleOwner` (shared by two service files)
- `backend/src/modules/projects/projects.service.ts` — list, detail, create
- `backend/src/modules/projects/projects.update.service.ts` — PATCH business rules
- `backend/src/modules/projects/projects.members.service.ts` — member add/remove, progress snapshots
- `backend/src/modules/projects/projects.controller.ts`, `projects.routes.ts`
- `backend/src/app.ts` — mounts `projectsRoutes` at `/api/v1/projects` (alongside the existing `projectActivityRoutes` from feature 06 — no path collisions)
- `backend/tests/integration/projects.test.ts` — 27 tests
- `docs/api-routes.md`, `docs/data-dictionary.md` — new rows/function doc

## Database
- Migration 012: `fn_project_delivery_status(p_as_of DATE)` — CTE-per-fact (overdue tasks, missed
  milestones, high-score open risks, progress), joined once to `projects`. No table/column changes.

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/projects | any (scoped) | See `docs/api-routes.md` for the full filter list. |
| POST | /api/v1/projects | project_manager, admin | One transaction; PM can only own what they create. |
| GET | /api/v1/projects/:id | view | Members + counts + progress + delivery status + budget headline. |
| PATCH | /api/v1/projects/:id | manage | Optimistic lock; strict body (no budget field). |
| GET/POST | /api/v1/projects/:id/members | view / manage | |
| DELETE | /api/v1/projects/:id/members/:userId | manage | 204. |
| GET | /api/v1/projects/:id/progress-snapshots | view | |

## Reusable pieces (use these, don't rebuild)
- `fn_project_delivery_status(p_as_of)` (SQL) — join by `project_id`, same pattern as `fn_project_progress`/`fn_project_financials`
- `projectsRepo.nextProjectCode(client)` — next free `PRJ-NNN`; call inside the same transaction as the insert
- `mutationsRepo.findEligibleOwner(userId, client?)` + `projects.shared.ts#isEligibleOwner(...)` — the "active project_manager or admin" check, reused by both create and ownership-transfer
- `mutationsRepo.countOpenTasks(projectId, client?, assigneeId?)` — reused by the "complete a project" guard (no `assigneeId`) and the "remove a member" guard (with it)
- `mutationsRepo.upsertMember(projectId, userId, role, client)` — `INSERT ... ON CONFLICT DO UPDATE`; used for the owner's own membership on create and for ownership transfer on PATCH
- `projectsRepo.findProjectSummaryById(id, asOf, client?)` — the one place that maps the list-row shape (department/owner objects, progress, delivery status); call it after a mutation inside the same transaction to build the audit `after` snapshot and the response body in one read

## Decisions & trade-offs
- **`scopedProjectIdsSql` (feature 05) doesn't fit the projects list query** — it assumes the
  table being filtered has its own `project_id` FK column (a fact table). The `projects` table's
  own scoping key is `id`, so list scoping here is a hand-written `owner_id = $u OR EXISTS
  (project_members ...)` condition instead. `scopedProjectIdsSql` remains the right tool for
  future fact-table list endpoints (tasks, risks, costs in features 08+).
- **"Missed milestone" is derived, not read off `milestones.status`** — the generator (feature
  03) and no feature built so far ever sets `status='missed'` directly, only `planned`/`achieved`.
  `fn_project_delivery_status` treats a `planned` milestone past `due_date` as missed too, so the
  `at_risk` rule actually fires against the seeded data.
- **"Pending CR" = `change_requests.status = 'submitted'`** — awaiting a decision; `returned` is
  excluded since it's back with the requester, not pending one. Revisit if feature 10 introduces a
  different working definition.
- **PATCH body is `.strict()`** — an `initialBudget` (or any other unknown field) is rejected with
  400 rather than silently ignored, so a client can't be misled into thinking a budget edit landed.
- **Owner-change eligibility reuses the create-time rule** (active + project_manager-or-admin)
  even though the feature file's PATCH row only says "must be PM" — read as the same constraint as
  creation for consistency, not a narrower one.
- **Service files split by concern, not just by size**: `projects.service.ts` (list/detail/create),
  `projects.update.service.ts` (PATCH), `projects.members.service.ts` (members + snapshots), with
  shared helpers lifted into `projects.shared.ts`. Repository is split the same way
  (read/write/members/detail) — CLAUDE.md's ~250-line-per-file limit made one `projects.service.ts`
  and one `projects.repository.ts` too large otherwise.
- **Budget headline / detail counts use scalar subqueries, not joins**, to get CLAUDE.md's
  "aggregate each fact separately" guarantee without writing out four CTEs for four single-number
  counts — same effect, less SQL.

## Known gaps / TODO for later features
- No endpoints yet to create/edit tasks, milestones, risks, or change requests — the detail
  view's counts and delivery-status inputs read tables that features 08–10 will populate and
  mutate going forward; nothing here depends on those features not existing yet.
- `GET /projects` has no `asOf`-independent cache; every list call recomputes
  `fn_project_progress()`/`fn_project_delivery_status()` for the whole scoped set. Fine at this
  dataset size; revisit if a later feature needs this at scale.

## How to verify quickly
```
cd backend
npm run typecheck && npm run lint && npm test   # 144 tests pass (27 new)
```
