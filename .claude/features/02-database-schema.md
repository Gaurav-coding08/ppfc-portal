# 02 — Database schema, migrations & financial SQL functions

## Goal
The complete relational model for every module (including tables used later by automation), a tiny explainable migration runner, and the single SQL source of truth for financial KPIs that the API, web dashboard and Power BI will all share.

## Depends on
01-project-setup

## Spec references
Assignment 2 §3.3 (entities, keys, indexes, constraints, cardinality), §4 (financial definitions), §8.1 (outbox/automation log), §7 (Power BI reads the same DB).

## Scope

### Migration runner — `backend/scripts/migrate.ts`
- Reads `backend/db/migrations/*.sql` in name order; table `schema_migrations(name text pk, applied_at timestamptz)`; runs each unapplied file inside its own transaction; logs applied names. Accepts `--test` flag to target `DATABASE_URL_TEST`. ~50 lines, commented.
- Wire `npm run db:migrate` and `npm run db:migrate:test`.

### Migrations (forward-only, numbered)

`001_core.sql`
- `app_settings(key text pk, value text not null)`; seed row `('reporting_date','2026-09-30')`.
- `departments(id bigint identity pk, code text unique not null, name text unique not null)`.
- `users(id bigint identity pk, email text not null, full_name text not null, password_hash text not null, role text not null check in ('contributor','project_manager','admin'), department_id bigint fk departments, is_active boolean default true, version int not null default 1, created_at, updated_at)`; unique index on `lower(email)`.

`002_delivery.sql`
- `projects(id identity pk, code text unique not null /* PRJ-001 */, name, description, department_id fk not null, owner_id fk users not null, status check in ('planning','active','on_hold','completed','cancelled'), start_date date not null, end_date date not null, check (end_date >= start_date), version int not null default 1, created_by fk users, created_at, updated_at)`.
- `project_members(project_id fk on delete cascade, user_id fk, member_role text check in ('manager','contributor'), added_at, primary key (project_id, user_id))`.
- `tasks(id, project_id fk not null, title not null, description, assignee_id fk users null, status check in ('todo','in_progress','blocked','done'), priority check in ('low','medium','high','critical'), start_date, due_date not null, weight numeric(6,2) not null check (weight > 0), progress int not null default 0 check 0..100, completed_at timestamptz, version, created_at, updated_at, check (status <> 'done' or progress = 100))`.
- `milestones(id, project_id fk, name, due_date not null, status check in ('planned','achieved','missed'), achieved_date date null, check (status <> 'achieved' or achieved_date is not null), version, created_at, updated_at)`.
- `risks(id, project_id fk, type check in ('risk','issue'), title, description, owner_id fk users, probability smallint check 1..5, impact smallint check 1..5, score smallint generated always as (probability * impact) stored, mitigation text, due_date date, status check in ('open','mitigating','closed'), closed_at timestamptz, version, created_at, updated_at)`.
- `progress_snapshots(id, project_id fk, snapshot_date date, progress_pct numeric(5,2), actual_spend numeric(14,2), unique(project_id, snapshot_date))`.

`003_governance.sql`
- `change_requests(id, code text unique /* CR-001 */, project_id fk, title, description, impact_summary, requested_by fk users not null, status check in ('submitted','approved','rejected','returned'), submitted_at timestamptz not null, decided_by fk users null, decided_at null, decision_reason null, version, created_at, updated_at)`; check `decided_by is null or decided_by <> requested_by` (self-approval blocked in the DB too).
- `change_history(id, change_request_id fk on delete cascade, from_status text null, to_status text not null, actor_id fk users, reason text, created_at)`.
- `audit_events(id, actor_id fk users null, entity_type text not null, entity_id bigint not null, action text not null, project_id bigint null, before jsonb, after jsonb, request_id text, created_at timestamptz default now())`.
- `idempotency_keys(key text, user_id bigint fk, method text, path text, response_status int, response_body jsonb, created_at, primary key (key, user_id))`.

`004_finance.sql`
- `cost_categories(id, code unique, name unique, is_active bool default true)`.
- `project_budgets(id, project_id fk unique not null /* 1:1 */, initial_amount numeric(14,2) not null check >= 0, currency char(3) default 'AED', approved_by fk users, approved_at timestamptz)`.
- `budget_revisions(id, project_id fk, amount numeric(14,2) not null check (amount <> 0) /* signed delta */, rationale text not null, status check in ('pending','approved','rejected'), requested_by fk not null, decided_by fk null, decided_at null, decision_reason null, effective_date date not null, created_at, check (decided_by is null or decided_by <> requested_by))`.
- `cost_transactions(id, project_id fk not null, category_id fk not null, txn_date date not null, amount numeric(14,2) not null check (amount > 0), description text not null, vendor text, status check in ('draft','posted'), entry_type check in ('expense','reversal') default 'expense', reverses_id bigint fk cost_transactions null unique, created_by fk, posted_by fk null, posted_at null, version, created_at, updated_at, check (status <> 'posted' or (posted_by is not null and posted_at is not null)), check ((entry_type = 'reversal') = (reverses_id is not null)))`.
- `financial_forecasts(id, project_id fk, month date not null check (extract(day from month) = 1), amount numeric(14,2) check >= 0, updated_by fk, updated_at, unique(project_id, month))`.
- **Trigger** `prevent_posted_cost_mutation`: BEFORE UPDATE/DELETE on cost_transactions → raise if OLD.status = 'posted' (allow nothing; DB-level guarantee of "no silent deletion of posted transactions").

`005_automation.sql`
- `outbox(id, event_type text, entity_type text, entity_id bigint, event_date date, payload jsonb, status check in ('pending','sent','failed') default 'pending', attempts int default 0, last_error text, created_at, processed_at, unique(event_type, entity_id, event_date))`.
- `automation_runs(id, job_name, started_at, finished_at, status check in ('running','success','failed'), items_found int, items_created int, error text)`.
- `notifications(id, user_id fk, title, body, link, outbox_id fk null, read_at null, created_at)`.

`006_indexes.sql`
- FK + filter indexes: projects(department_id), projects(owner_id), projects(status), project_members(user_id), tasks(project_id, status), tasks(assignee_id), tasks(due_date), milestones(project_id, due_date), risks(project_id, status), risks(score) where status <> 'closed', change_requests(project_id, status), change_history(change_request_id), audit_events(entity_type, entity_id), audit_events(created_at desc), cost_transactions(project_id, status, txn_date), cost_transactions(category_id), budget_revisions(project_id, status), financial_forecasts(project_id, month).

`007_financial_functions.sql` — **the single definition of every finance KPI**
- `fn_reporting_date() returns date` → reads app_settings.
- `fn_project_financials(p_as_of date) returns table(project_id, initial_budget, approved_revisions, current_budget, actual_spend, remaining_budget, utilization, forecast_to_complete, eac, projected_variance, forecast_missing, is_overrun, is_near_budget)`.
  - Built from **separate CTEs**: `budget` (initial + Σ approved revisions with effective_date <= p_as_of), `actuals` (Σ posted, txn_date <= p_as_of, reversal negative), `ftc` (Σ forecasts where month > date_trunc('month', p_as_of)), then LEFT JOIN each to projects. Comment why: avoids join fan-out.
  - `utilization = actual / nullif(current_budget,0)`; `is_near_budget = utilization >= 0.9 and not is_overrun`; `is_overrun = eac > current_budget`.
- `fn_project_progress() returns table(project_id, progress_pct, task_count, done_count)` = Σ(weight × progress)/Σ weight, 0 when no tasks.
- View `v_project_financials` = `select * from fn_project_financials(fn_reporting_date())` and `v_project_progress` — these are what Power BI and Access will read.

`008_reader_grants.sql`
- `grant connect`/`usage`/`select on all tables and views in schema public to ppfc_reader`; `alter default privileges ... grant select ... to ppfc_reader`. Guard with `DO $$ IF EXISTS role $$`.

### Docs
- `docs/data-dictionary.md`: one section per table — purpose, columns (type, null, meaning), keys, cardinality (e.g. project 1—N tasks, project 1—1 budget, CR 1—N history).
- `docs/architecture.md`: add an ER summary and a paragraph on the **fan-out risk** (project × tasks × costs multiplies rows) and how CTE-first aggregation prevents it.

## Tests
- `integration/schema.test.ts` (run against migrated test DB):
  - Inserting a cost with amount 0 fails (check constraint).
  - Updating a posted cost fails (trigger).
  - Change request with `decided_by = requested_by` fails.
  - `risks.score` equals probability × impact.
  - `fn_project_financials` on a hand-built mini fixture (inserted in the test, 1 project: budget 1000, approved rev +200, pending rev +500, posted 300 on/before date, draft 100, posted 50 after date, forecasts next 2 months 100 each): current 1200, actual 300, remaining 900, utilization 0.25, FTC 200, EAC 500, variance 700.
  - Zero-budget project → utilization null.
- Update `globalSetup` to run migrations on the test DB.

## Acceptance
```
npm run db:migrate && npm run db:migrate:test
npm run typecheck && npm run lint && npm test
psql postgres://ppfc_reader:ppfc_reader_pw@localhost:5433/ppfc -c "select * from v_project_financials limit 1"   # works, read-only
```

## Out of scope
Data generation (03). API endpoints.

## Design rationale
Why NUMERIC not float for money; why KPI math lives in one SQL function (web dashboard + Power BI reconcile by construction); the fan-out problem; DB-level guards (checks, trigger, self-approval check) as defence in depth behind service rules; why `reporting_date` is a setting (production → `current_date`).
