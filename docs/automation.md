# Automation (feature 15)

One executed business automation, built on a transactional outbox: the same
event is never notified twice, and a failed delivery retries safely without
re-running the business logic that queued it.

## Trigger

Two independent producers feed one shared outbox/dispatcher pipeline:

1. **Overdue escalation — scheduled job.** `overdueEscalation.job.ts`'s
   `runOverdueEscalation({ asOf, trigger })` scans for incomplete tasks
   (`status <> 'done' AND due_date < asOf`) and queues one `TASK_OVERDUE`
   outbox event per overdue task per day. Runs every `AUTOMATION_CRON` tick
   via `src/worker.ts` (`trigger: 'schedule'`), or on demand via
   `POST /api/v1/admin/automation/overdue-escalation/run` (`trigger: 'manual'`)
   or `npm run automation:run`.
2. **Change request approved — transactional.** When a CR decision commits
   with `decision: 'approve'`, `changeRequests.decision.service.ts` inserts a
   `CR_APPROVED` outbox row in the **same transaction** as the status update,
   history row and audit row. Reject/return write nothing. If the outbox
   insert throws, the whole decision rolls back with it — there is no path
   where a CR shows as approved but no event was queued, or vice versa.

## Rules

| Event | Queued when | Recipients |
|---|---|---|
| `TASK_OVERDUE` | Task `status <> 'done'` and `due_date < asOf` (due *on* asOf is not overdue) | Assignee (if any) + project manager (the project's `owner_id`), de-duplicated. Unassigned task → manager only. |
| `CR_APPROVED` | CR decision = `approve` | The CR's requester |

## Idempotency

- **Producer**: `outbox` has `UNIQUE (event_type, entity_id, event_date)`.
  Re-running the overdue scan for a task/day that already has a row is a
  silent no-op (`ON CONFLICT DO NOTHING`) — `itemsFound` still counts it,
  `itemsCreated` does not. This is what makes `npm run automation:run` safe
  to run twice (see **Run evidence** below).
- **Dispatcher**: `notifications` has `UNIQUE (outbox_id, user_id)` — even if
  the same outbox row were dispatched twice (a double-processing bug, or two
  workers racing), each recipient still gets exactly one notification row.
- **Concurrency**: the producer wraps its scan in
  `pg_try_advisory_xact_lock(hashtext('overdue-escalation'))`. A second
  concurrent call (a manual trigger overlapping a cron tick) gets a
  non-blocking `false` back and fails fast with 409 `JOB_ALREADY_RUNNING`
  instead of scanning twice. The dispatcher instead claims one row at a time
  with `SELECT ... FOR UPDATE SKIP LOCKED`, so two dispatcher passes can run
  at once without either blocking on, or re-processing, the other's row.

## Retry / backoff

| Attempt | Outcome | Next `next_attempt_at` |
|---|---|---|
| 1st failure | `attempts = 1`, stays `pending` | `now() + 2 minutes` |
| 2nd failure | `attempts = 2`, stays `pending` | `now() + 4 minutes` |
| 3rd failure (= `AUTOMATION_MAX_ATTEMPTS`, default 3) | `attempts = 3`, `status = 'failed'` | — no longer picked up |

A `failed` event stops retrying automatically — it needs an explicit admin
action, `POST /api/v1/admin/automation/outbox/:id/retry`, which resets
`status = 'pending'`, `attempts = 0`, `next_attempt_at = now()`.

## Failure handling

Delivery and its bookkeeping are split into two transactions on purpose:

1. **Claim + deliver + mark sent** — one transaction. If delivery (the
   `deliver` function, default `createInAppNotifications`) throws, this
   transaction rolls back, so no notification row and no `status = 'sent'`
   ever commit for a failed attempt.
2. **Record the failure** — a brand-new transaction, run *after* the first
   one has already rolled back. This is why the failure record survives even
   though the work it describes didn't: if both lived in the same
   transaction, rolling back the failed delivery would also roll back the
   `attempts++`.

If the worker process crashes between the notification insert and marking
the row `sent`, neither committed (same transaction) — the row is still
`pending` and gets picked up again next tick. A re-run safely re-attempts
delivery; `UNIQUE (outbox_id, user_id)` prevents a duplicate notification if
some recipients were already (impossibly, since it's one transaction)
notified.

## How to run the demo

```bash
cd backend
npm run automation:run   # run 1: itemsCreated > 0 (first time these tasks are overdue)
npm run automation:run   # run 2: itemsCreated = 0 (idempotency evidence)
```

```bash
docker compose --profile app up -d --build   # api + worker start
docker logs <worker-container>               # worker logs each scheduled pass
```

### Run evidence (captured 2026-10-18, dev DB)

```
$ npm run automation:run
{
  "run": { "runId": 6, "itemsFound": 42, "itemsCreated": 42 },
  "dispatch": { "processed": 42, "sent": 42, "retried": 0, "failed": 0 }
}

$ npm run automation:run
{
  "run": { "runId": 7, "itemsFound": 42, "itemsCreated": 0 },
  "dispatch": { "processed": 0, "sent": 0, "retried": 0, "failed": 0 }
}
```

```sql
SELECT id, job_name, started_at, status, items_found, items_created, error
FROM automation_runs ORDER BY id DESC LIMIT 5;

 id |       job_name        |          started_at           | status  | items_found | items_created |                    error
----+-----------------------+--------------------------------+---------+-------------+----------------+----------------------------------------------
  8 | overdue-escalation    | 2026-10-18 20:27:00.063354+00 | success |          42 |             0 |
  7 | overdue-escalation    | 2026-10-18 20:24:29.825737+00 | success |          42 |             0 |
  6 | overdue-escalation    | 2026-10-18 20:24:26.095364+00 | success |          42 |            42 |
  5 | overdue-task-notifier | 2026-09-01 06:00:00+00        | success |           8 |             8 |
  4 | cr-sla-check          | 2026-08-01 06:00:00+00        | failed  |             |                | Connection to notification service timed out
```

Run id 8 is the worker's scheduled pass (`trigger: 'schedule'`, confirmed
from its own log line `"scheduled automation pass finished"`), captured with
`AUTOMATION_CRON` temporarily set to `* * * * *` to observe a tick within the
same session — the default is `*/5 * * * *`. Runs 4–5 are historical seed
evidence (pre-dating feature 15's own job; see
`scripts/generate/automation.ts`), included to show the "at least one failed
run" requirement is met in demo data too, not only in live test runs.

## How production would differ

- **`asOf`** defaults to `REPORTING_DATE`/`?asOf=`, matching every other
  financial/delivery endpoint in this API. A real deployment would schedule
  the job against `current_date` instead of a fixed reporting date.
- **`deliver`** is injectable (`outboxDispatcher.ts`'s `DeliverFn` type) so
  tests can force failures without a real channel. Production would swap
  `createInAppNotifications` for an adapter that also sends email/Teams,
  while still writing the same `notifications` rows this one does.
- **Email/Teams delivery** and a frontend notification bell are out of scope
  for this phase (no frontend yet) — see the feature file's "Out of scope".
