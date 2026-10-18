# 03 — Synthetic data generator, CSV export & import

## Goal
A deterministic generator that writes credible fictional data to CSV (with every required edge case deliberately present), and an importer that loads those **same CSVs** into Postgres. The test DB is reset from these CSVs too, so tests, demo and Power BI all see identical data.

## Depends on
02-database-schema

## Spec references
Assignment 2 §6 (sizes, edge cases, fixed seed, reporting date 30 Sep 2026, CSV export → import, data dictionary), §3.3.

## Scope

### `backend/scripts/generate-data.ts` → `data/csv/<table>.csv`
- `faker.seed(42)`; all dates computed relative to the fixed reporting date `2026-09-30` (never `new Date()`), so output is byte-identical on every run.
- Explicit IDs in CSVs (identity columns are `generated always`, so import uses `OVERRIDING SYSTEM VALUE` and then resets sequences).
- Fictional only: company-neutral names, `@ppfc.demo` emails. Currency AED.

| Table | Minimum |
|---|---|
| departments | 3 (e.g. Digital Platforms, Network Engineering, Enterprise IT) |
| users | 15: 1 admin, 4 project managers, 10 contributors, spread across departments |
| projects | 8 (+1 completed counts within the 8), codes PRJ-001… |
| project_members | each project: owner PM as `manager` + 3–5 contributors |
| tasks | ≥ 80, weights 1–5 |
| milestones | ≥ 24 |
| risks | ≥ 20 (mix of risk/issue) |
| change_requests | ≥ 15, codes CR-001…; with `change_history` rows consistent with each CR's status path |
| cost_categories | 4: Labour, Licences & Software, Hardware, External Services |
| project_budgets | 1 per project |
| budget_revisions | ≥ 6 |
| cost_transactions | ≥ 80 |
| financial_forecasts | monthly Oct 2026 → each project's end month |
| progress_snapshots | monthly snapshots per project (≥ 4 each) |
| automation_runs | ≥ 5 historical runs (success + one failed) |
| audit_events | events matching seeded CR decisions and posted costs |

Demo login password for **all** seeded users: `Demo@1234` (bcrypt hash generated with a fixed salt round; document as dev-only).

### Mandatory edge cases (hard-code them by project/record, don't leave to randomness)
Map each to a named fixture and list it in `docs/data-dictionary.md` → "Edge-case catalogue":
- PRJ with **no posted spend** (only drafts or nothing).
- PRJ **near budget** (utilization 90–99%).
- PRJ **forecast to exceed** budget (EAC > current budget).
- ≥ 5 **overdue incomplete** tasks (due < 2026-09-30, status ≠ done).
- 1 task **due exactly 2026-09-30**.
- 1 **unassigned** task.
- 1 **completed project** (all tasks done).
- 1 **closed high-exposure** risk (score ≥ 15, status closed) — must not count as open.
- 1 **open high-exposure** risk.
- 1 **returned** and 1 **rejected** change request.
- 1 **approved** and 1 **pending** budget revision (pending must not affect budget).
- **Posted and draft** costs; 1 posted cost **after** the cutoff (Oct 2026).
- 1 project **without forecast** rows (EAC = actual, `forecastMissing`).
- 1 project with a **reversal** entry.
- Records across all 3 departments and multiple months (Jan–Sep 2026).

### `backend/scripts/import-csv.ts`
- Target DB from `--test` flag or default. In one transaction: `TRUNCATE ... RESTART IDENTITY CASCADE` all data tables (not `schema_migrations`, not `app_settings`), load CSVs in FK order using parameterized batched inserts (or `COPY FROM STDIN` via `pg-copy-streams` if preferred — ask before adding the dep), then `setval` each identity sequence to max(id).
- The posted-cost trigger must not block import: load costs directly with final status (inserts are allowed; the trigger is on UPDATE/DELETE).
- Print row counts per table.

### Wiring
- `npm run data:generate`, `npm run db:import`, `npm run db:import:test`, `npm run db:reset` (= migrate + import).
- `tests/helpers/globalSetup.ts`: migrate test DB + import CSVs.
- `tests/helpers/resetDb.ts`: re-import (for test files that mutate data; call in `beforeAll`).

### Docs
- `docs/demo-accounts.md`: table of email / role / department / projects they belong to (generated from the CSV, not hand-typed), plus the password and a dev-only warning.
- `docs/data-dictionary.md`: append edge-case catalogue and generation method.
- `README.md`: "Data" section — generate → import flow, reporting-date explanation (production would use `current_date` or a user-selected date via `?asOf=`).

## Tests
- `integration/data.test.ts` against the imported test DB:
  - Row counts meet every minimum in the table above.
  - Each edge case is queryable (one assertion per bullet), e.g. `select count(*) from tasks where due_date < '2026-09-30' and status <> 'done'` ≥ 5.
  - Closed high-exposure risk exists and is excluded by `status <> 'closed'`.
  - `v_project_financials` shows ≥ 1 `is_overrun`, ≥ 1 `is_near_budget`, ≥ 1 `forecast_missing`, ≥ 1 project with actual = 0.
- `unit/generate-determinism.test.ts`: generating twice into temp dirs yields identical file hashes.

## Acceptance
```
npm run data:generate && git diff --stat data/csv   # second run: no diff
npm run db:reset && npm run db:import:test
npm run typecheck && npm run lint && npm test
```

## Out of scope
API endpoints.

## Design rationale
Why generate → CSV → import (reproducible, auditable, same data in DB / tests / Power BI); why edge cases are hand-placed fixtures, not random; how a fixed seed + fixed reporting date makes output deterministic.
