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
