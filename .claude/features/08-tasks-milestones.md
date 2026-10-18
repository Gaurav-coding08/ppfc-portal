# 08 — Tasks & milestones

## Goal
Task and milestone management with overdue/upcoming indicators and weighted project progress. Journey 2: *a team member updates an assigned task; the persisted record changes project progress and the executive dashboard.*

## Depends on
07-projects

## Spec references
Assignment 2 §1 journeys 2–3, §2 module 02, §3.5 concurrency.

## Scope — modules `modules/tasks/`, `modules/milestones/`

### Tasks
| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/projects/:projectId/tasks` | view | filters `status` (multi), `assigneeId` (or `unassigned=true`), `priority`, `overdue=true`, `dueFrom`, `dueTo`, `q`; sort whitelist `dueDate,priority,status,progress,title`; paginated. Each row adds computed `isOverdue` (due < asOf and status ≠ done), `isDueSoon` (due within 7 days of asOf), `assigneeName`. |
| GET | `/api/v1/tasks/mine` | any | caller's assigned tasks across scoped projects, same filters |
| GET | `/api/v1/tasks/:id` | view (via task's project) | |
| POST | `/api/v1/projects/:projectId/tasks` | manage | `{ title, description?, assigneeId?, status?, priority, startDate?, dueDate, weight, progress? }`; assignee must be a project member (422); dueDate ≥ startDate; due date outside project dates → 422; audited |
| PATCH | `/api/v1/tasks/:id` | manage → any field; **contributor assignee → only `progress`, `status`** (other fields → 403 `FORBIDDEN` with the offending fields in details) | requires `version`. Rules: `status=done` ⇒ progress forced/required 100 and `completed_at = now()`; progress 100 ⇒ status done; moving out of done clears `completed_at`; `blocked` allowed with progress < 100. Audited with before/after. |
| DELETE | `/api/v1/tasks/:id` | manage | only if progress = 0 and status `todo` (else 422); audited |

### Milestones
| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/projects/:projectId/milestones` | view | `?status&dueWithinDays`; computed `isOverdue` (planned and due < asOf), `daysToDue` |
| POST | `/api/v1/projects/:projectId/milestones` | manage | due date within project dates (422) |
| PATCH | `/api/v1/milestones/:id` | manage | version; `achieved` requires `achievedDate` ≤ today/asOf; audited |

### Progress
- Project progress always comes from `fn_project_progress()` — never stored on the project, never computed in JS. After a task PATCH, `GET /projects/:id` must reflect the new value (this is the "recompute from SQL" requirement).

### Concurrency demo (document in `docs/architecture.md`)
Two clients load the same task (version 3); A saves → version 4; B saves with version 3 → 409 `VERSION_CONFLICT` with `currentVersion: 4`. Frontend will show "This task was changed by someone else — reload".

## Tests (`integration/tasks.test.ts`, `integration/milestones.test.ts`)
- Contributor updates own task progress → 200, version increments, project `progressPct` changes to the expected weighted value.
- Contributor tries to change `dueDate` or `assigneeId` on own task → 403; updating **another** member's task → 403; task in non-member project → 404.
- Stale version → 409 (concurrency scenario).
- `status=done` with progress 60 → normalised to 100 (or 422 — pick one, document it, test it).
- Assigning a non-member → 422.
- `overdue=true` returns the seeded overdue tasks (≥ 5) and excludes the task due exactly on 2026-09-30.
- Unassigned filter returns the seeded unassigned task.
- Milestones `dueWithinDays=14` correct against asOf; achieved without date → 422.

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Interview talking points
Field-level authorization for contributors; why progress is derived not stored; overdue boundary (`<` vs `<=` and the task due exactly on the reporting date); optimistic locking flow.
