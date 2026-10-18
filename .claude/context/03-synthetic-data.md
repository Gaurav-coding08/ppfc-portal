# 03 — Synthetic data generator, CSV export & import (done 2026-10-18)

## What exists now
A deterministic in-memory dataset builder (`backend/scripts/generate/`) writes the full
demo dataset to `data/csv/*.csv`, and an importer (`importAll`) truncates and reloads
those same CSVs into Postgres. The test harness now seeds the test DB from the same
CSVs, so dev, test and any future Power BI report all read identical data. Every
mandatory edge case from the feature spec is a hand-placed fixture (see
`docs/data-dictionary.md` → "Edge-case catalogue"), not left to chance.

## Files
- `backend/scripts/generate/types.ts` — row shapes, one per table, and the `Dataset` type
- `backend/scripts/generate/dates.ts` — fixed-date helpers (`addDays`, `daysBetween`, `REPORTING_DATE`); never `new Date()` with no args
- `backend/scripts/generate/departments.ts`, `users.ts`, `projects.ts` — core fixtures (3 depts, 15 users incl. fixed bcrypt hash for `Demo@1234`, 8 projects + `project_members`)
- `backend/scripts/generate/tasks.ts`, `milestones.ts`, `risks.ts`, `snapshots.ts` — delivery data, proportional to each project's own date span
- `backend/scripts/generate/finance.ts` — cost_categories, project_budgets, budget_revisions (hand-picked amounts)
- `backend/scripts/generate/costs.ts` — 42 pinned `cost_transactions` fixtures + a 45-row deterministic draft-only filler loop (never touches a pinned posted sum)
- `backend/scripts/generate/forecasts.ts` — monthly forecasts Oct 2026 → each project's end month; PRJ-005 and the completed PRJ-004 deliberately have none
- `backend/scripts/generate/governance.ts` — change_requests + change_history, consistent status paths
- `backend/scripts/generate/audit.ts` — audit_events for every CR decision and every posted cost
- `backend/scripts/generate/automation.ts` — 5 automation_runs (4 success, 1 failed)
- `backend/scripts/generate/index.ts` — `buildDataset()`, reseeds faker(42) every call
- `backend/scripts/generate/csvWriter.ts` — `writeDataset()`, `TABLE_ORDER`, explicit per-table column lists
- `backend/scripts/generate/importAll.ts` — the shared truncate → batched-insert → setval logic (used by both the CLI and the test harness)
- `backend/scripts/generate-data.ts` — CLI entry (`npm run data:generate`)
- `backend/scripts/import-csv.ts` — CLI entry (`npm run db:import` / `--test`)
- `backend/tests/helpers/globalSetup.ts` — now imports the CSVs after migrating
- `backend/tests/helpers/resetDb.ts` — re-imports CSVs; call from a test file's `beforeAll` if it mutates seed data
- `backend/tests/integration/data.test.ts` — row-count minimums + every edge case (32 tests)
- `backend/tests/unit/generate-determinism.test.ts` — builds the dataset twice in-process, hashes CSVs, compares
- `docs/demo-accounts.md`, `docs/data-dictionary.md` (edge-case catalogue), `README.md` (Data section)

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
- Numbers/dates/statuses for every edge case are hand-picked constants; faker is only used for filler text and the draft-only cost filler, so determinism never depends on faker's own RNG sequence being stable across versions in a way that matters to a test assertion
- `cost_transactions` filler rows are always `status: 'draft'` — guarantees the ≥80-row minimum without perturbing any pinned project's posted actual spend
- Password hash is a hard-coded bcrypt string (computed once offline), not hashed at generation time — hashing at runtime would pull in bcrypt's random salt and break the "regenerate twice, no diff" requirement
- Timestamp columns with a DB default (`created_at`, `updated_at`, `submitted_at`, etc.) are omitted from the CSVs entirely and get the DB's `now()` default on import, rather than carrying a fabricated value
- Import uses batched multi-row `INSERT ... VALUES (...), (...)` (500 rows/statement) rather than one `INSERT` per row or `COPY FROM STDIN` — avoids the `pg-copy-streams` dependency while still being a single statement per batch
- `importAll` takes a connected `pg.Client` rather than owning the connection — lets the CLI script and the test harness each manage their own connection lifecycle

## Known gaps / TODO for later features
- `buildFillerCosts` amounts are a simple deterministic formula (`500 + (i*137) % 8000`), not faker — fine since their only job is to pad the row count as drafts
- No API yet reads this data — feature 07+ build the endpoints against it

## How to verify quickly
```
cd backend
npm run data:generate && git diff --stat ../data/csv   # no diff after first commit
npm run db:reset && npm run db:import:test
npm run typecheck && npm run lint && npm test            # 50 tests pass
docker exec ppfc-portal-db-1 psql -U ppfc -d ppfc -c "SELECT * FROM v_project_financials ORDER BY project_id;"
```
