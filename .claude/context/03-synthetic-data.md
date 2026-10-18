# 03 — Synthetic data generator, CSV export & import (done 2026-10-18)

## What exists now
A deterministic in-memory dataset builder (`backend/scripts/generate/`) writes the full
demo dataset to `data/csv/*.csv`, and an importer (`importAll`) truncates and reloads
those same CSVs into Postgres. The test harness now seeds the test DB from the same
CSVs, so dev, test and any future Power BI report all read identical data. Every
mandatory edge case from the feature spec is a hand-placed fixture (see
`docs/data-dictionary.md` → "Edge-case catalogue"), not left to chance. Every
business-meaningful timestamp (created_at/updated_at on every business table,
submitted_at/decided_at, posted_at, completed_at, closed_at, achieved_date, change_history
and audit_events timestamps) is an explicit historical value derived from the fixed
reporting date — none of them fall back to the DB's `now()` default, and only one single
row in the whole dataset (the documented post-cutoff cost on PRJ-007) is dated after the
reporting date.

## Files
- `backend/scripts/generate/types.ts` — row shapes, one per table, and the `Dataset` type
- `backend/scripts/generate/dates.ts` — fixed-date helpers: `addDays`, `daysBetween`, `atTime` (date -> full timestamp), `shiftTimestamp` (shift a timestamp by N days, same time of day), `isAfterReportingDate`, `REPORTING_DATE`; never `new Date()` with no args
- `backend/scripts/generate/departments.ts`, `users.ts`, `projects.ts` — core fixtures (3 depts, 15 users incl. fixed bcrypt hash for `Demo@1234` and a fixed onboarding timestamp, 8 projects each with its own created_at 14 days before kickoff + `project_members` added_at = project's created_at)
- `backend/scripts/generate/tasks.ts`, `milestones.ts`, `risks.ts`, `snapshots.ts` — delivery data, proportional to each project's own date span; created_at = the project's own kickoff date; a task/risk can't be `done`/`closed` with a due date after the reporting date (downgraded to `blocked`/`mitigating` instead) — that's what keeps completed_at/closed_at always historical
- `backend/scripts/generate/finance.ts` — cost_categories, project_budgets, budget_revisions (hand-picked amounts; created_at is 3 days before decided_at when decided, else 14 days before effective_date when still pending)
- `backend/scripts/generate/costs.ts` — 42 pinned `cost_transactions` fixtures + two filler loops: 12 draft-only rows on the two amount-locked projects (PRJ-001, PRJ-002) and 36 posted rows on the other six projects, cycling month = (i % 9) + 1 so every month Jan-Sep gets posted spend regardless of what the pinned rows happen to cover
- `backend/scripts/generate/forecasts.ts` — monthly forecasts Oct 2026 → each project's end month; PRJ-005 and the completed PRJ-004 deliberately have none; updated_at fixed to the same September planning-cycle date for all rows
- `backend/scripts/generate/governance.ts` — change_requests (explicit submitted_at always before decided_at) + change_history (created_at = the CR's own submitted_at/decided_at, so it's chronological by construction), consistent status paths
- `backend/scripts/generate/audit.ts` — audit_events for every CR decision and every posted cost; created_at = the decision's/post's own timestamp, not a separate value
- `backend/scripts/generate/automation.ts` — 5 automation_runs (4 success, 1 failed)
- `backend/scripts/generate/index.ts` — `buildDataset()`, reseeds faker(42) every call
- `backend/scripts/generate/csvWriter.ts` — `writeDataset()`, `TABLE_ORDER`, explicit per-table column lists (every business timestamp column is listed — none are left out to pick up a DB default)
- `backend/scripts/generate/importAll.ts` — the shared truncate → batched-insert → setval logic (used by both the CLI and the test harness)
- `backend/scripts/generate-data.ts` — CLI entry (`npm run data:generate`)
- `backend/scripts/import-csv.ts` — CLI entry (`npm run db:import` / `--test`)
- `backend/tests/helpers/globalSetup.ts` — now imports the CSVs after migrating
- `backend/tests/helpers/resetDb.ts` — re-imports CSVs; call from a test file's `beforeAll` if it mutates seed data
- `backend/tests/integration/data.test.ts` — row-count minimums, every edge case, and a "Business timestamp realism" block (no timestamp after the cutoff except the one documented exception, CR submitted/decided ordering, change_history chronological order, posted spend in every month Jan-Sep) — 36 tests
- `backend/tests/unit/generate-determinism.test.ts` — builds the dataset twice in-process, hashes CSVs, compares
- `docs/demo-accounts.md`, `docs/data-dictionary.md` (edge-case catalogue + timestamp policy), `README.md` (Data section)

## Database
No schema changes. `data/csv/*.csv` (17 files, committed) is the seed data; `app_settings`
and `schema_migrations` are never touched by import.

## Endpoints
None (out of scope for this feature).

## Reusable pieces (use these, don't rebuild)
- `buildDataset()` (`scripts/generate/index.ts`) — in-memory dataset, safe to call more than once per process
- `importAll(client: pg.Client)` (`scripts/generate/importAll.ts`) — truncate + load + reset sequences, takes an already-connected client, runs in one transaction
- `resetDb()` (`tests/helpers/resetDb.ts`) — call in `beforeAll` of any test file that mutates seed rows
- `PROJECTS`, `CONTRIBUTOR_SETS` (`scripts/generate/projects.ts`) — exported so other generator files stay consistent with project ownership/membership
- `DEMO_PASSWORD` / `DEMO_PASSWORD_HASH` (`scripts/generate/users.ts`) — the seeded login password and its fixed hash

## Decisions & trade-offs
- Dataset lives entirely in memory as plain TS objects/arrays, not a database — the generator has zero DB dependency, only the importer does
- Numbers/dates/statuses for every edge case are hand-picked constants; faker is only used for filler text, so determinism never depends on faker's own RNG sequence being stable across versions in a way that matters to a test assertion
- Every business timestamp is written explicitly in the CSV, derived from a fixed base date with `atTime`/`shiftTimestamp` — none rely on the DB's `now()` default at import time, so re-importing on a different day never changes the data
- Only two projects (PRJ-001, PRJ-002) are "amount-locked": their posted-spend totals feed a tested KPI band (zero spend; 90-99% utilization), so filler on them is always `draft`. Every other project has no such constraint — more posted spend there only reinforces its edge case (overrun, forecastMissing) or has no effect at all — so filler on them is mostly `posted`, which is what gets the dataset to ~75% posted overall and posted spend in every month Jan-Sep
- A task/risk can't be `done`/`closed` with a due date that hasn't happened yet as of the reporting date (downgraded to `blocked`/`mitigating` instead) — otherwise its completed_at/closed_at would have to be a future timestamp with no story behind it
- Password hash is a hard-coded bcrypt string (computed once offline), not hashed at generation time — hashing at runtime would pull in bcrypt's random salt and break the "regenerate twice, no diff" requirement
- Import uses batched multi-row `INSERT ... VALUES (...), (...)` (500 rows/statement) rather than one `INSERT` per row or `COPY FROM STDIN` — avoids the `pg-copy-streams` dependency while still being a single statement per batch
- `importAll` takes a connected `pg.Client` rather than owning the connection — lets the CLI script and the test harness each manage their own connection lifecycle

## Known gaps / TODO for later features
- Filler cost amounts are a simple deterministic formula (`500 + (i*137) % 8000` for drafts, `800 + (i*193) % 9000` for posted), not faker — fine since their only job is to pad the row count and spread spend across months
- No API yet reads this data — feature 07+ build the endpoints against it

## How to verify quickly
```
cd backend
npm run data:generate && git diff --stat ../data/csv   # no diff after first commit
npm run db:reset && npm run db:import:test
npm run typecheck && npm run lint && npm test            # 54 tests pass
docker exec ppfc-portal-db-1 psql -U ppfc -d ppfc -c "SELECT * FROM v_project_financials ORDER BY project_id;"
docker exec ppfc-portal-db-1 psql -U ppfc -d ppfc -c "SELECT date_trunc('month', txn_date)::date, count(*) FROM cost_transactions WHERE status='posted' GROUP BY 1 ORDER BY 1;"
```
