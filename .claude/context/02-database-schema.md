# 02 — Database schema, migrations & financial SQL functions (done 2026-10-18)

## What exists now
The full relational model across 8 forward-only migrations: core tables (app_settings, departments, users), delivery tables (projects, members, tasks, milestones, risks, progress_snapshots), governance tables (change_requests, change_history, audit_events, idempotency_keys), finance tables (cost_categories, project_budgets, budget_revisions, cost_transactions, financial_forecasts), automation tables (outbox, automation_runs, notifications), indexes, financial SQL functions, and ppfc_reader grants. A working migration runner applies unapplied `.sql` files in order, tracking state in `schema_migrations`. Financial KPIs are defined once in SQL via `fn_project_financials(as_of)`, exposed through `v_project_financials` for Power BI.

## Files
- `backend/scripts/migrate.ts` — migration runner; reads `db/migrations/*.sql`, tracks in `schema_migrations`, supports `--test` flag
- `backend/db/migrations/001_core.sql` — app_settings, departments, users
- `backend/db/migrations/002_delivery.sql` — projects, project_members, tasks, milestones, risks, progress_snapshots
- `backend/db/migrations/003_governance.sql` — change_requests, change_history, audit_events, idempotency_keys
- `backend/db/migrations/004_finance.sql` — cost_categories, project_budgets, budget_revisions, cost_transactions, financial_forecasts, trigger
- `backend/db/migrations/005_automation.sql` — outbox, automation_runs, notifications
- `backend/db/migrations/006_indexes.sql` — FK and filter indexes for all tables
- `backend/db/migrations/007_financial_functions.sql` — fn_reporting_date, fn_project_financials, fn_project_progress, views
- `backend/db/migrations/008_reader_grants.sql` — ppfc_reader SELECT grants
- `backend/tests/integration/schema.test.ts` — 6 constraint + finance function tests
- `backend/tests/helpers/globalSetup.ts` — now runs migrations on test DB before tests
- `docs/data-dictionary.md` — full table-by-table reference
- `docs/architecture.md` — added ER summary and fan-out explanation

## Database
All tables listed in the feature spec are created. Key constraints:
- `users` has case-insensitive unique email index
- `tasks`: CHECK `done ⇒ progress = 100`, weight > 0, progress 0–100
- `milestones`: CHECK `achieved ⇒ achieved_date IS NOT NULL`
- `risks`: `score` is GENERATED ALWAYS AS `probability * impact` STORED
- `change_requests`: CHECK `decided_by IS NULL OR decided_by <> requested_by`
- `budget_revisions`: same self-approval check
- `cost_transactions`: CHECK amount > 0, posted ⇒ posted_by+posted_at, reversal ⇔ reverses_id; trigger blocks UPDATE/DELETE on posted rows
- `financial_forecasts`: month must be first of month, UNIQUE(project_id, month)
- `project_budgets`: UNIQUE(project_id) enforces 1:1 with projects

## Endpoints
No new endpoints (schema only).

## Reusable pieces (use these, don't rebuild)
- `migrate.ts` — `tsx --env-file=.env scripts/migrate.ts [--test]` — applies pending migrations
- `fn_reporting_date()` — returns the system reporting date from app_settings
- `fn_project_financials(p_as_of date)` — returns full financial KPIs per project; uses CTE-first aggregation
- `fn_project_progress()` — returns weighted progress per project
- `v_project_financials` / `v_project_progress` — views for Power BI using default reporting date
- `schema_migrations` table — tracks which migration files have been applied
- `globalSetup.ts` — runs migrations on test DB before every test run

## Decisions & trade-offs
- Migration runner is ~60 lines of plain pg.Client code rather than a library — keeps it explainable and has no external dependency
- `schema_migrations` table is created both by the runner and by globalSetup (idempotent `CREATE TABLE IF NOT EXISTS`) so either entry point works
- `prevent_posted_cost_mutation` trigger is DB-level defence in depth — service layer also enforces immutability, but the trigger catches any bypass
- `fn_project_financials` aggregates each fact (budget, actuals, forecasts) in a separate CTE, then LEFT JOINs to projects — avoids the fan-out that would occur joining tasks × costs × forecasts directly
- `forecast_missing` flags projects with no forecast rows at all (FTC defaults to 0 for them)
- ppfc_reader grants are wrapped in `DO $$ IF EXISTS role $$` so migration doesn't fail on setups without the init.sql role

## Known gaps / TODO for later features
- No data in the tables yet — feature 03 generates CSVs and imports them
- globalSetup runs migrations but not CSV import — feature 03 adds that
- `npm run db:reset` will work once feature 03 implements `import-csv.ts`

## How to verify quickly
```
cd backend
npm run db:migrate && npm run db:migrate:test
npm run typecheck && npm run lint && npm test   # 12 tests pass
docker exec ppfc-portal-db-1 psql "postgres://ppfc_reader:ppfc_reader_pw@localhost:5432/ppfc" -c "SELECT * FROM v_project_financials LIMIT 1"
```
