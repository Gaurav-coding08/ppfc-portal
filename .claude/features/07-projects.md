# 07 — Projects & membership

## Goal
Project portfolio CRUD with search/filter/sort/pagination, scoped visibility, membership management, project details with live progress and delivery status, and progress snapshots. Journey 1: *a PM creates a project, assigns an owner and records delivery dates and initial approved budget.*

## Depends on
05-access-control-platform, 06-admin-users-audit

## Spec references
Assignment 2 §1 journey 1, §2 module 01, §3.1 data interaction, §3.2.

## Scope — module `modules/projects/`

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/projects` | any (scoped) | filters `q` (code/name ILIKE), `departmentId`, `ownerId`, `status` (multi), `startFrom`, `endTo`; sort whitelist `code,name,status,startDate,endDate,progress`; paginated. Each row: id, code, name, department, owner, status, dates, `progressPct` (from `fn_project_progress`), `deliveryStatus`, `version`. |
| GET | `/api/v1/projects/:id` | view | details + members + counts (tasks, overdue tasks, open risks, pending CRs) + `progressPct` + `deliveryStatus` + budget headline (current budget, actual, utilization from `fn_project_financials(asOf)`) |
| POST | `/api/v1/projects` | PM, admin | `{ code?, name, description, departmentId, ownerId, status, startDate, endDate, initialBudget }`. Code auto-generated `PRJ-NNN` if omitted. Owner must be an active `project_manager` (or admin). **One transaction:** insert project, add owner to `project_members` as `manager`, insert `project_budgets` with `approved_by = actor`, audit `project.create`. A PM may only create projects they own (ownerId = self); admin any owner. |
| PATCH | `/api/v1/projects/:id` | manage | `{ name?, description?, departmentId?, ownerId?, status?, startDate?, endDate?, version }` with optimistic lock; end ≥ start (422); changing owner → new owner must be PM and becomes `manager` member; status `completed` only if all tasks done (422 otherwise); audit with before/after. |
| GET | `/api/v1/projects/:id/members` | view | |
| POST | `/api/v1/projects/:id/members` | manage | `{ userId, memberRole }`; user must be active; duplicate → 409; audited |
| DELETE | `/api/v1/projects/:id/members/:userId` | manage | cannot remove the owner (422); unassign their open tasks? → **no**: return 422 if they have open assigned tasks, listing count; audited |
| GET | `/api/v1/projects/:id/progress-snapshots` | view | ordered by date |

### Delivery status rule (document in code + data dictionary)
Computed in SQL against `asOf`:
- `completed` if status completed;
- `at_risk` if any overdue incomplete task **or** a missed milestone **or** an open risk with score ≥ 15;
- `behind` if elapsed-time % − progress % > 15 points;
- else `on_track`.

### Initial budget vs revisions
Initial budget is set only at creation. Later changes go through budget revisions (feature 12) — PATCH must not accept a budget field.

## Tests (`integration/projects.test.ts`)
- Contributor list returns only member projects; admin sees all 8+; PM sees owned/managed + member projects.
- Filters (department, status, owner, date range) and sort/pagination meta correct.
- Non-member contributor `GET /projects/:id` → 404; member contributor PATCH → 403.
- PM creates project → 201; project, owner membership, budget and audit rows exist (one transaction: force a failure on budget insert with invalid amount and assert no project row persisted).
- PM creating a project owned by someone else → 403.
- PATCH with stale version → 409; end < start → 422; set completed with open tasks → 422.
- Member add/remove rules incl. cannot remove owner.
- `progressPct` for a project equals hand-computed weighted average from seeded tasks.

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Interview talking points
Why project + owner membership + budget are one transaction; how list scoping is a SQL filter (not post-filtering in JS); delivery-status rule and its thresholds; optimistic locking on edit.
