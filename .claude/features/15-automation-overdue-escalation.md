# 15 — Business automation: overdue escalation + approved-change notifications

## Goal
One executed business automation with a real trigger, rules, a visible outcome and a persistent execution log, built on a **transactional outbox** so the same event is never notified twice and failures retry safely. Covers Assignment 2 §8.1 and acceptance test **G** (automation part).

Two event sources feed one dispatcher:
1. **Overdue escalation (scheduled job):** finds overdue incomplete tasks as of the reporting date and queues one `TASK_OVERDUE` event per task per day.
2. **Approved change request (transactional):** when a CR is approved in feature 10's decision transaction, a `CR_APPROVED` event is written in the **same transaction** (resolves the TODO left in feature 10).

## Depends on
05-access-control-platform, 08-tasks-milestones, 10-change-requests, 14-backend-hardening

## Spec references
Assignment 2 §8.1 (trigger, rules, real run, visible outcome, persistent log, safe retry/failure, no duplicate sends), §3.3 automation/logging entities, §3.5 (logging with request id), §6 (automation log records as evidence).

## Existing schema (from 02 — do not recreate)
- `outbox(id, event_type, entity_type, entity_id, event_date, payload jsonb, status 'pending'|'sent'|'failed', attempts, last_error, created_at, processed_at, UNIQUE(event_type, entity_id, event_date))`
- `automation_runs(id, job_name, started_at, finished_at, status 'running'|'success'|'failed', items_found, items_created, error)`
- `notifications(id, user_id, title, body, link, outbox_id, read_at, created_at)`

## New migration — next free number (check `db/migrations/`, do not reuse a number)
- `ALTER TABLE outbox ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();`
- Index `outbox(status, next_attempt_at) WHERE status = 'pending'`.
- `UNIQUE (outbox_id, user_id)` on `notifications` — defence in depth against duplicate notifications.
- Re-run reader grants if the migration creates anything new (Power BI/Access read `automation_runs`).

## Scope — module `modules/automation/` + `modules/notifications/`

### Producer — `overdueEscalation.job.ts`
- `runOverdueEscalation({ asOf, trigger: 'schedule'|'manual', actorId? })`.
- One transaction:
  1. `pg_try_advisory_xact_lock(hashtext('overdue-escalation'))` → if not acquired, throw `conflict('JOB_ALREADY_RUNNING')` (409). Prevents cron + manual run overlapping.
  2. Insert `automation_runs` row `status='running'` (separate short tx first, so a failed run is still logged).
  3. Select overdue tasks with the **same rule as feature 08**: `due_date < asOf AND status <> 'done'` (task due exactly on asOf is NOT overdue). Reuse the repository predicate — do not duplicate the rule.
  4. `INSERT INTO outbox ... ON CONFLICT (event_type, entity_id, event_date) DO NOTHING RETURNING id` with `event_type='TASK_OVERDUE'`, `entity_type='task'`, `event_date=asOf`, payload `{ taskId, projectId, projectCode, title, dueDate, daysOverdue, assigneeId, managerId }`.
  5. `items_found` = overdue tasks selected, `items_created` = rows actually inserted.
- Finish the run row: `success` with counts, or `failed` with `error` message (never the stack). Log with job name + run id.
- `asOf` defaults to the reporting date (same source the API uses). Production would use `current_date` — document this.

### Transactional event — change to feature 10
- In the CR decision transaction, when `decision = 'approve'`, insert outbox `CR_APPROVED` (`entity_type='change_request'`, `event_date = current_date`, payload `{ crId, code, projectId, requesterId, decidedBy, reason }`) **before COMMIT**. Reject/return insert nothing.
- If the outbox insert fails, the whole decision rolls back — explain this in code comments.

### Dispatcher — `outboxDispatcher.ts`
- `dispatchPending({ limit = 50, deliver = createInAppNotifications })` — `deliver` is injectable so tests can force failures.
- Per event, its own transaction:
  1. `SELECT ... FROM outbox WHERE status='pending' AND next_attempt_at <= now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED` (loop up to `limit`). `SKIP LOCKED` lets two dispatchers run without double-processing.
  2. Resolve recipients:
     - `TASK_OVERDUE` → assignee (if any) + project manager; unassigned task → manager only; de-duplicate if same user.
     - `CR_APPROVED` → requester.
  3. Insert notifications (`ON CONFLICT (outbox_id, user_id) DO NOTHING`) and set outbox `status='sent', processed_at=now()` — **same transaction**, so notification and "sent" commit together or not at all.
- On error: roll back the event's tx, then in a new tx set `attempts = attempts + 1`, `last_error`, `next_attempt_at = now() + (2 ^ attempts) * interval '1 minute'`; when `attempts >= AUTOMATION_MAX_ATTEMPTS` (default 3) set `status='failed'`. Failed events are never retried automatically.
- Returns `{ processed, sent, retried, failed }`.

### Scheduler / worker — `src/worker.ts`
- Separate entrypoint: `npm run worker`. Uses `node-cron` with `AUTOMATION_CRON` (default `*/5 * * * *`): producer then dispatcher. Graceful shutdown on SIGINT/SIGTERM (stop cron, close pool).
- Add `worker` service to `docker-compose.yml` under `profiles: ["app"]`, same image, command `node dist/worker.js`.
- CLI for demos: `npm run automation:run` → one producer + dispatcher pass, prints the run summary.
- Env (add to `config/env.ts` + `.env.example`): `AUTOMATION_CRON`, `AUTOMATION_MAX_ATTEMPTS=3`, `AUTOMATION_ENABLED=true`.

### Endpoints

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| POST | `/api/v1/admin/automation/overdue-escalation/run` | admin | Manual trigger: producer (`trigger='manual'`) + dispatcher pass; returns `{ run, dispatch }`; idempotent by design (second call creates 0); audited |
| GET | `/api/v1/admin/automation/runs` | admin | Paginated, newest first, filter `status`, `jobName` |
| GET | `/api/v1/admin/automation/outbox` | admin | Paginated, filter `status`, `eventType` |
| POST | `/api/v1/admin/automation/outbox/:id/retry` | admin | Only from `failed` → `pending`, `attempts=0`, `next_attempt_at=now()`; else 409 `INVALID_TRANSITION`; audited |
| GET | `/api/v1/notifications` | any | **Own only**; `?unread=true`; paginated; `unreadCount` in response |
| PATCH | `/api/v1/notifications/:id/read` | any | Own only — another user's id → 404; idempotent (already read → 200 unchanged) |

All routes go through the existing auth, validation, request-id logging and route-guard test from feature 14 — add the new routes to the RBAC matrix.

### Seed evidence
If feature 03 did not already generate automation history, extend the generator (same fixed seed) with a few historical `automation_runs` (including one `failed`) and matching `outbox`/`notifications` rows, and export them to CSV with the rest.

### Docs
- `docs/automation.md`: trigger, rules, recipients, idempotency key, retry/backoff table, failure handling, how to run the demo, how production would differ (real email/Teams adapter behind `deliver`, `current_date` as asOf).
- Update `docs/api-routes.md`, `docs/data-dictionary.md` (outbox statuses, `next_attempt_at`), README run instructions.

## Tests

`integration/automation-producer.test.ts`
- Run creates exactly one outbox row per overdue incomplete task; the task due **exactly** on asOf and `done` tasks are excluded.
- **Run twice → second run `items_created = 0`**, outbox row count unchanged, two `automation_runs` rows both `success`.
- Two producer calls in parallel → no duplicate outbox rows (one may return 409 `JOB_ALREADY_RUNNING`).
- A forced producer error leaves an `automation_runs` row with `status='failed'` and `error` set.

`integration/automation-dispatcher.test.ts`
- Success: overdue event → notifications for assignee + manager, outbox `sent`, `processed_at` set.
- Unassigned overdue task → manager only.
- Failing `deliver` → `attempts=1`, `last_error` set, still `pending`, `next_attempt_at` in the future, **zero notifications** (rolled back).
- After `AUTOMATION_MAX_ATTEMPTS` failures → `failed`; dispatcher no longer picks it up; admin retry → `pending`.
- Dispatching the same event twice (re-run) → still exactly one notification per recipient.

`integration/automation-cr-approved.test.ts`
- Approving a CR writes exactly one `CR_APPROVED` outbox row in the same tx; reject/return write none.
- Simulated outbox insert failure → CR decision rolled back (status and history unchanged).

`integration/notifications.test.ts`
- Contributor calling any `/admin/automation/*` route → 403.
- `GET /notifications` returns only the caller's rows; `PATCH` on another user's notification → 404.

## Acceptance
```
npm run typecheck && npm run lint && npm test
npm run automation:run   # run 1: items_created > 0
npm run automation:run   # run 2: items_created = 0 (idempotency evidence)
docker compose --profile app up -d --build   # api + worker start, worker logs a scheduled run
```
Capture both CLI outputs and a `SELECT * FROM automation_runs ORDER BY id DESC LIMIT 5;` result into `docs/automation.md` as run evidence.

## Out of scope
Email/Teams delivery, frontend notification bell (frontend phase), Power BI/Access automation pages.

## Design rationale
Why an outbox instead of notifying directly (the event commits atomically with the business change; delivery happens later and can retry); how the unique key `(event_type, entity_id, event_date)` makes the producer idempotent; why `FOR UPDATE SKIP LOCKED` and the advisory lock prevent double processing; what happens if the worker crashes between notification insert and marking `sent` (same tx, so neither commits); why failed events stop retrying and need an admin action.
