# Architecture

## Layers

```
HTTP request
   │
   ▼
routes          (URL + middleware wiring: authenticate, validate, idempotency)
   │
   ▼
controller      (parse validated input, call service, shape HTTP response — no SQL, no business rules)
   │
   ▼
service         (business rules, authorization checks on loaded resources, transactions, audit writes)
   │
   ▼
repository      (the only place SQL lives — parameterized, accepts an optional client for transactions)
   │
   ▼
PostgreSQL
```

Cross-cutting pieces that every layer can reach: `config/env.ts` (validated env), `lib/logger.ts`
(pino), `lib/errors.ts` (`AppError` + helpers), `middleware/errorHandler.ts` (maps any thrown
error to the standard `{ error: { code, message, details?, requestId } }` body), `db/pool.ts`
(single `pg.Pool`) and `db/tx.ts` (`withTx` for atomic mutation + audit).

`db/pool.ts` also registers two `pg` type-parser overrides, process-wide, so every query
through the pool (and any ad-hoc `pg.Client` a script or test opens — the override is global
to the `pg` module, not per-connection) gets JS-friendly values instead of `pg`'s defaults:
BIGINT (OID 20) as a real `number` (ids never approach `MAX_SAFE_INTEGER`) and DATE (OID 1082)
as the raw `YYYY-MM-DD` string Postgres already sends, instead of a `Date` object that
`JSON.stringify` would otherwise render as a full, timezone-shifted ISO datetime.

See `CLAUDE.md` for the full repo layout, API conventions, roles/authorization model and
financial definitions. This file stays a short map of *why* the layers are shaped this way;
details live in each feature's context file under `.claude/context/`.

## Entity-relationship summary

```
departments 1——N users
departments 1——N projects
users       1——N projects (owner)
projects    1——N project_members (→ users, role: manager|contributor)
projects    1——N tasks (→ users via assignee)
projects    1——N milestones
projects    1——N risks (→ users via owner)
projects    1——1 project_budgets
projects    1——N budget_revisions
projects    1——N cost_transactions (→ cost_categories)
projects    1——N financial_forecasts
projects    1——N change_requests (→ users via requested_by, decided_by)
projects    1——N progress_snapshots
change_requests 1——N change_history
users       1——N notifications
```

## Fan-out risk and CTE-first aggregation

When a project has N tasks, M costs, and K forecast rows, a naive `SELECT` that joins
all three to the project produces N × M × K rows — every combination is materialized,
inflating sums by the cardinality of the other dimensions. This is the "fan-out" problem.

The solution: **aggregate each fact in its own CTE first**, then `LEFT JOIN` the
single-row-per-project CTEs together. `fn_project_financials(as_of)` implements this
pattern: a `budget` CTE (initial + approved revisions), an `actuals` CTE (posted costs),
and an `ftc` CTE (future forecasts), each grouped by `project_id` before they touch
each other. The final `SELECT` joins these three one-row CTEs to `projects`, so every
project gets exactly one output row with correct totals.

## Optimistic locking and the concurrency scenario

Every mutable entity (`projects`, `tasks`, `milestones`, …) carries a `version int`.
A client must send back the `version` it last read; `lib/versioning.ts#updateWithVersion`
runs `UPDATE ... WHERE id = $1 AND version = $2` — 0 rows affected means someone else
updated the row first, which `updateWithVersion` turns into a 409 `VERSION_CONFLICT`
carrying `details.currentVersion` (re-read in the same statement's follow-up query).

Concrete walkthrough (feature 08, tasks): two browser tabs, A and B, both load the same
task at `version: 3`.

1. A edits `progress` and saves with `version: 3` → the `UPDATE ... WHERE version = 3`
   matches one row, the trigger-free `version = version + 1` bumps it to `4`, A's
   response shows `version: 4`.
2. B (still holding the stale `version: 3` from its original load) edits `status` and
   saves with `version: 3` → `UPDATE ... WHERE version = 3` now matches **zero** rows
   (the row is already at `4`), so the API returns `409 VERSION_CONFLICT` with
   `{ details: { currentVersion: 4 } }` instead of silently overwriting A's change.

The frontend's response to that 409 is to discard B's in-memory edit and show "This task
was changed by someone else — reload", rather than retrying the write (retrying would
need to re-apply B's intended change against the new row, which is a merge decision for
the user, not something the client can safely automate).
