# 15 — Business automation: overdue escalation + CR-approved notifications (done 2026-10-18)

## What exists now
A transactional-outbox automation pipeline: a scheduled producer
(`overdueEscalation.job.ts`) queues `TASK_OVERDUE` events for overdue
incomplete tasks; the existing CR decision transaction (feature 10) now
also queues a `CR_APPROVED` event on approval, in the same transaction. A
shared dispatcher (`outboxDispatcher.ts`) claims pending events with
`FOR UPDATE SKIP LOCKED`, writes `notifications` rows, and retries failed
deliveries with exponential backoff up to `AUTOMATION_MAX_ATTEMPTS`. A
separate worker process (`src/worker.ts`, `npm run worker`) runs both on a
cron schedule; `npm run automation:run` runs one pass for demos. New
`modules/automation/` (admin-only management) and `modules/notifications/`
(any user, own rows) expose it over HTTP.

## Files
- `backend/db/migrations/015_automation_retry.sql` — `outbox.next_attempt_at`, its partial index, `UNIQUE(outbox_id, user_id)` on `notifications`
- `backend/src/modules/automation/overdueEscalation.job.ts` — producer: advisory-lock + scan + outbox insert, run-row bookkeeping
- `backend/src/modules/automation/outboxDispatcher.ts` — dispatcher: claim/deliver/mark-sent, or roll back + record retry/failure in a new tx; `DeliverFn` is injectable
- `backend/src/modules/automation/automation.mutations.repository.ts` — all the above's SQL (`startRun`, `finishRun`, `selectOverdueTasks`, `insertOverdueOutboxRows`, `insertCrApprovedOutbox`, `claimNextPendingOutboxEvent`, `insertNotifications`, `markOutboxSent`, `markOutboxRetryOrFailed`, `retryOutboxEvent`)
- `backend/src/modules/automation/automation.repository.ts` — read queries (`listRuns`, `listOutbox`, `findRawOutboxForUpdate`)
- `backend/src/modules/automation/automation.service.ts`, `.controller.ts`, `.routes.ts`, `.schemas.ts` — admin HTTP surface
- `backend/src/modules/notifications/*` — own-rows-only HTTP surface
- `backend/src/worker.ts` — node-cron entrypoint (separate from `server.ts`)
- `backend/scripts/automation-run.ts` — `npm run automation:run` CLI
- `backend/src/modules/change-requests/changeRequests.decision.service.ts` — resolved the feature 10 TODO: `insertCrApprovedOutbox` called in the same `withTx` on `decision: 'approve'`
- `backend/src/modules/tasks/tasks.repository.ts` — exported `OVERDUE_CONDITION_SQL` so the producer reuses the exact overdue rule instead of re-deriving it
- `backend/src/config/env.ts`, `.env.example` — `AUTOMATION_CRON`, `AUTOMATION_MAX_ATTEMPTS`, `AUTOMATION_ENABLED`
- `docker-compose.yml` — new `worker` service (`profiles: ["app"]`); both `api` and `worker` now override `DATABASE_URL` to the in-network `db` host (see Decisions — this was a latent bug affecting `api` too)
- `backend/scripts/generate/automation.ts` — added `buildOutboxEvents`/`buildNotifications` (feature 03 had only `buildAutomationRuns`); `backend/scripts/generate/importAll.ts` — fixed `IMPORT_ORDER` (was missing `outbox`/`notifications` even though `DATA_TABLES`/`SEQUENCE_TABLES` already listed them — those rows were being truncated and never reloaded)
- `backend/tests/integration/automation-producer.test.ts`, `automation-dispatcher.test.ts`, `automation-cr-approved.test.ts`, `notifications.test.ts` — new
- `backend/tests/integration/route-guard.test.ts`, `rbac-matrix.test.ts`, `data.test.ts` — extended
- `docs/automation.md` — new; `docs/api-routes.md`, `docs/data-dictionary.md`, `README.md` — updated

## Database
- Migration 015 (see Files). No new tables — `outbox`/`automation_runs`/`notifications` already existed from migration 005.

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | /api/v1/admin/automation/overdue-escalation/run | admin | Manual producer + dispatcher pass. `{ run, dispatch }`. Audited. |
| GET | /api/v1/admin/automation/runs | admin | `?status&jobName&page&pageSize` |
| GET | /api/v1/admin/automation/outbox | admin | `?status&eventType&page&pageSize` |
| POST | /api/v1/admin/automation/outbox/:id/retry | admin | `failed` → `pending` only; else 422 `INVALID_TRANSITION`. Audited. |
| GET | /api/v1/notifications | any | Own rows only. `?unread=true`. `unreadCount` in response. |
| PATCH | /api/v1/notifications/:id/read | any | Own only (404 otherwise). Idempotent. |

## Reusable pieces (use these, don't rebuild)
- `OVERDUE_CONDITION_SQL` (`tasks.repository.ts`) — the one place "overdue" is expressed as SQL; assumes `asOf` bound as `$1`
- `dispatchPending({ limit?, deliver? })` (`outboxDispatcher.ts`) — returns `{ processed, sent, retried, failed }`; pass a custom `deliver` in tests to force failures
- `runOverdueEscalation({ asOf?, trigger, actorId? })` (`overdueEscalation.job.ts`) — always finishes its own `automation_runs` row (success or failed) before rethrowing
- `insertCrApprovedOutbox(input, client)` (`automation.mutations.repository.ts`) — call inside any transaction that approves something and should notify the requester

## Decisions & trade-offs
- **`JOB_ALREADY_RUNNING` reuses `conflict()`** (409 `IDEMPOTENCY_CONFLICT`) and the retry endpoint's illegal-transition reuses `invalidTransition()` (422, not the feature file's stated 409) — CLAUDE.md's fixed `ErrorCode` enum has no better fit for either, same precedent as feature 10's CR decision errors.
- **"Project manager" recipient = the project's `owner_id`**, not every `project_members` row with `member_role = 'manager'` — the schema has exactly one owner per project and the feature asks for one manager recipient.
- **Claimed-event data crosses the rollback boundary via a typed error (`DeliveryFailure`)**, not a mutated outer variable — assigning to a `let` from inside the `withTx` callback and reading it in the `catch` block type-narrows to `never` under this TS/strict config (control-flow analysis discards narrowing across the closure boundary oddly here); throwing a `DeliveryFailure { event }` sidesteps it entirely and is arguably clearer anyway.
- **`power(2, $1::int)` needed an explicit cast** in the backoff UPDATE — reusing the same `$1` as both an `int` column assignment and a `power()` exponent without casting both occurrences the same way raises Postgres's "inconsistent types deduced for parameter" error.
- **node-cron added as a new dependency** (confirmed with the user first, per CLAUDE.md's "ask before adding a dependency" rule) rather than hand-rolling interval scheduling, so `AUTOMATION_CRON` can be real cron syntax.
- **Fixed a latent seed-data bug while extending it**: `importAll.ts`'s `DATA_TABLES`/`SEQUENCE_TABLES` already listed `outbox`/`notifications` (presumably added speculatively in feature 03) but `IMPORT_ORDER` didn't — so every `resetDb()`/`db:import` was truncating those tables and never reloading them. Only surfaced now because this feature is the first to actually populate CSVs for them.
- **`docker-compose.yml`'s `api`/`worker` services now override `DATABASE_URL`** to the in-network `db:5432` host. `backend/.env`'s own value (`localhost:5433`) is correct for `npm run dev` on the host but unreachable from inside the compose network — this silently broke `api`'s own containerized health check too (feature 14 never actually verified the `docker compose --profile app` acceptance step beyond "it starts"; this feature's acceptance step required it to actually work, which surfaced the bug).
- **Dispatcher/producer integration tests pick a pre-2026-01-24 `asOf`** (before any seeded task's `due_date`) or insert controlled fixture rows directly via SQL, rather than fighting the full seeded dataset's real overdue tasks — see the test files' comments for the exact reasoning.
- **Seed evidence's `outbox` event id 3 is `status = 'failed'`, not `'pending'`** — a pending seed row would be claimed by the dispatcher the instant any test called `dispatchPending()`, breaking test isolation; `failed` demonstrates the same "needs an admin retry" state without that side effect.

## Known gaps / TODO for later features
- No frontend notification bell (explicitly out of scope — no frontend yet).
- No real email/Teams delivery adapter — `deliver` is injectable but only `createInAppNotifications` exists.
- `retryOutboxEvent`'s audit row has `projectId: null` — the outbox row isn't joined back to a project (it has no FK to one), so this admin action isn't attributable to a specific project in the audit trail the way most other mutations are.

## How to verify quickly
```bash
cd backend
npm run typecheck && npm run lint && npm test   # 453 tests pass (20 new)
npm run routes:check
npm run automation:run   # run twice: itemsCreated > 0, then 0
docker compose --profile app up -d --build && curl -i localhost:4000/api/v1/health
```
