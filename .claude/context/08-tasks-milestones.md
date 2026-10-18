# 08 — Tasks & milestones (done 2026-10-18)

## What exists now
Task and milestone CRUD under each project (`modules/tasks/`, `modules/milestones/`), with
scoped list filters, computed overdue/due-soon flags, field-level authorization so a
contributor can only touch `progress`/`status` on their own assigned task, and a shared
status/progress resolution rule that keeps every task row consistent with the DB's
`CHECK (status <> 'done' OR progress = 100)`. Project `progressPct` (from
`fn_project_progress`, feature 07) recomputes automatically after any task PATCH — nothing
is cached or computed in JS. Also fixed a latent cross-feature bug: `pg` was returning
`DATE` columns as JS `Date` objects, not `YYYY-MM-DD` strings.

## Files
- `backend/src/modules/tasks/tasks.schemas.ts` — zod schemas; `status` has **no default** on
  create so the service can tell "omitted" apart from "explicitly 'todo'" (see Decisions)
- `backend/src/modules/tasks/tasks.repository.ts` — `listProjectTasks`, `listMyTasks`,
  `findTaskById`, `findRawTaskById`; `TASK_COLUMNS`/`TASK_FROM` split so a caller can inject
  `count(*) OVER()` into the SELECT list without landing it in the FROM clause
- `backend/src/modules/tasks/tasks.mutations.repository.ts` — `insertTask`, `deleteTask`
- `backend/src/modules/tasks/tasks.shared.ts` — `resolveStatusProgress` (status/progress/
  completedAt resolution, shared by create and PATCH)
- `backend/src/modules/tasks/tasks.service.ts` — list/get/create/delete
- `backend/src/modules/tasks/tasks.update.service.ts` — PATCH + field-level authorization
- `backend/src/modules/tasks/tasks.controller.ts`, `tasks.routes.ts` — two routers:
  `projectTasksRoutes` (mounted at `/api/v1/projects`) and `tasksRoutes` (mounted at
  `/api/v1/tasks`; `/mine` registered before `/:id`)
- `backend/src/modules/milestones/*` — same shape, no field-level split (manage-only)
- `backend/src/db/pool.ts` — added a DATE (OID 1082) type-parser override
- `backend/src/lib/errors.ts` — `forbidden()` now takes an optional `details` param
- `backend/src/app.ts` — mounts all four new routers
- `backend/tests/integration/tasks.test.ts` (24 tests), `milestones.test.ts` (12 tests)
- `docs/api-routes.md`, `docs/architecture.md` (concurrency walkthrough + the DATE fix)

## Database
No migration — `tasks`/`milestones` tables, CHECK constraints and indexes already existed
from migrations 002/006. No schema change this feature.

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET/POST | /api/v1/projects/:projectId/tasks | view / manage | filters, computed fields |
| GET | /api/v1/tasks/mine | any | caller's own assigned tasks, any project |
| GET/PATCH/DELETE | /api/v1/tasks/:id | view / manage+assignee / manage | see `docs/api-routes.md` |
| GET/POST | /api/v1/projects/:projectId/milestones | view / manage | |
| PATCH | /api/v1/milestones/:id | manage | |

## Reusable pieces (use these, don't rebuild)
- `tasks.shared.ts#resolveStatusProgress(current, patch)` — the one place status/progress/
  completedAt consistency is computed; call for both create and update
- `getProjectAccess(userId, role, projectId, client?)` (feature 05) — needed directly (not
  just `assertProjectAccess`) wherever a role needs field-level nuance beyond plain view/manage
- `forbidden(message, details?)` (feature 04/05, extended here) — now matches `badRequest`/
  `businessRule`/`conflict`/`versionConflict` in accepting a `details` payload
- `membersRepo.findMemberRole` (feature 07) — reused for the "assignee must be a project
  member" check on both task create and update

## Decisions & trade-offs
- **`status: 'done'` always normalises `progress` to 100** rather than rejecting a
  mismatched value (feature file explicitly allowed picking either; documented and tested).
  Symmetrically, reaching `progress: 100` with no explicit `status` in the same patch infers
  `done`; dropping `progress` below 100 on an already-`done` task with no explicit `status`
  reverts it to `in_progress`. An **explicit** `status` in the patch always wins over the
  progress-based inference (e.g. `status: 'blocked', progress: 100` is accepted as-is).
- **`createTaskBodySchema.status` has no zod `.default()`** — a default would make "omitted"
  indistinguishable from "explicitly 'todo'" by the time the service sees it, breaking the
  done-inference rule on create (sending `progress: 100` alone would silently stay `todo`).
  The "current" baseline passed into `resolveStatusProgress` on create is `{status: 'todo',
  progress: 0}` instead.
- **Field-level authorization lives in `tasks.update.service.ts`, not `lib/access.ts`** —
  `assertProjectAccess` only knows project-level view/manage; the contributor-assignee
  exception needs `getProjectAccess`'s raw `canManage`/`memberRole` plus a check against the
  task's own `assignee_id`, which is task-specific, not project-specific.
- **`isDueSoon` excludes `done` tasks** — flagging a finished task as "due soon" is noise;
  same reasoning CLAUDE.md already applies to `isOverdue`.
- **Milestone create also enforces "achieved needs achievedDate ≤ asOf"**, even though the
  feature file states that rule only for PATCH — the DB CHECK already requires *some*
  achieved_date on create, so enforcing the fuller rule there too is free and consistent.
- **Fixed `db/pool.ts` to return DATE columns as plain strings** (see Known gaps) — a
  cross-cutting fix, not scoped to this feature's own tables, but every existing date column
  was silently affected.

## Known gaps / TODO for later features
- The DATE type-parser fix in `db/pool.ts` changes the *actual* (not just intended) runtime
  shape of every `start_date`/`end_date`/`due_date`/etc. column read anywhere in the app,
  including feature 07's `projects` module. No existing test asserted an exact date string
  equality on an API response, so nothing broke, but it's worth knowing this shipped in this
  feature's commit, not feature 07's.
- `GET /tasks/mine` doesn't return which project each task belongs to beyond `projectId` —
  no project code/name — fine for now since no UI consumes it yet.

## How to verify quickly
```
cd backend
npm run typecheck && npm run lint && npm test   # 180 tests pass (36 new)
```
