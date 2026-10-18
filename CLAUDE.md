# PPFC Portal — Project Portfolio & Financial Control Portal

Internal PMO application: projects, tasks, milestones, risks, change-request approvals, project finance (budgets, costs, forecasts, EAC) and an executive analytics dashboard. Built as a take-home assignment. **Every line must be explainable by the human owner in a live interview**, so prefer clear, boring, well-commented code over clever code.

## Stack (do not change without asking)

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 LTS, TypeScript (strict), ESM |
| API | Express 4, zod (validation), pino + pino-http (logging) |
| DB | PostgreSQL 16 via `pg` (raw parameterized SQL, **no ORM**) |
| Auth | bcryptjs + jsonwebtoken, JWT in httpOnly cookie `ppfc_token` (Bearer header also accepted for API tools/tests) |
| Security | helmet, cors (allowlist), express-rate-limit, cookie-parser |
| Tests | Vitest + supertest against a real Postgres test DB (`ppfc_test`) |
| Data | @faker-js/faker with fixed seed 42, csv-stringify / csv-parse |
| Dev tooling | tsx (run TS), ESLint + Prettier, Docker Compose (Postgres) |
| Frontend (later phase) | React + Vite + TypeScript |

## Repo layout

```
ppfc-portal/
├── CLAUDE.md
├── docker-compose.yml
├── docker/postgres/init.sql        # creates ppfc_test DB + ppfc_reader role
├── data/csv/                       # generated CSVs (committed)
├── docs/                           # api-routes, data-dictionary, architecture, security, ai-dev-log, e2e-checklist
├── backend/
│   ├── db/migrations/NNN_name.sql  # forward-only, numbered
│   ├── scripts/                    # migrate.ts, generate-data.ts, import-csv.ts
│   ├── src/
│   │   ├── app.ts                  # buildApp() — no listen(); used by tests
│   │   ├── server.ts               # listen()
│   │   ├── config/env.ts
│   │   ├── db/{pool,tx}.ts
│   │   ├── lib/                    # errors, logger, audit, pagination, money, dates
│   │   ├── middleware/             # requestId, authenticate, authorize, validate, idempotency, errorHandler
│   │   └── modules/<module>/       # <m>.routes.ts, .controller.ts, .service.ts, .repository.ts, .schemas.ts
│   └── tests/{helpers,unit,integration}/
├── frontend/                       # later phase
└── .claude/{features,skills,context}/
```

## Commands (run from `backend/`)

```
docker compose up -d db            # (from repo root) Postgres on localhost:5433
npm run dev                        # tsx watch src/server.ts
npm run db:migrate                 # apply migrations to DATABASE_URL
npm run data:generate              # write data/csv/*.csv (deterministic)
npm run db:import                  # truncate + load CSVs into DB
npm run db:reset                   # migrate + import
npm run typecheck && npm run lint
npm test                           # vitest run (uses DATABASE_URL_TEST)
```

## Layering rules

- **routes** wire URL + middleware (authenticate, validate, idempotency) → **controller**.
- **controller**: parse validated input, call service, shape HTTP response. No SQL, no business rules.
- **service**: business rules, authorization checks on the loaded resource, transactions (`withTx`), audit writes.
- **repository**: the only place SQL lives. Parameterized (`$1`) only — never string-concatenate values. Accepts an optional `client` so it can run inside a transaction.
- One module per folder. No file over ~250 lines; split it.

## API conventions

- Base path `/api/v1`. JSON in camelCase; DB columns snake_case; map in the repository.
- List: `{ data: T[], meta: { page, pageSize, total } }`. `page` default 1, `pageSize` default 20, max 100. Single: `{ data: T }`.
- Errors (always): `{ error: { code, message, details?, requestId } }`.
- Status codes: 200 read/update, 201 create, 204 delete, 400 malformed, 401 unauthenticated, 403 role not allowed, 404 not found **or out of the caller's project scope** (don't leak existence), 409 version/state conflict, 422 business-rule violation, 429 rate limit.
- Error codes: `VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VERSION_CONFLICT, INVALID_TRANSITION, SELF_APPROVAL_FORBIDDEN, BUSINESS_RULE, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL`.
- Optimistic locking: mutable entities have `version int`. Client sends `version`; `UPDATE ... WHERE id=$1 AND version=$2` → 0 rows = 409 `VERSION_CONFLICT`. Increment on every update.
- Idempotency: `Idempotency-Key` header on cost posting, CR decisions, budget-revision decisions. Same key + same user replays the stored response.
- Dates are `YYYY-MM-DD`. Money is `NUMERIC(14,2)` in DB; **sum and compute money in SQL**, never in JS loops; return as number rounded to 2 dp with `currency: "AED"`.
- Every response carries `x-request-id`.

## Roles & authorization (server-side, every route)

Global role on `users.role`: `contributor | project_manager | admin`.

- **canView(project)**: admin, OR project owner, OR row in `project_members`.
- **canManage(project)**: admin, OR (`role = project_manager` AND (owner OR `project_members.member_role = 'manager'`)).
- Contributor: view member projects; update **own assigned task's** `progress`/`status` only; submit change requests. **Never** approve, post costs, or edit finance.
- Project Manager: manage their projects (tasks, milestones, risks, costs, forecasts, budget-revision requests); decide CRs on their projects **except their own**.
- Admin: everything; role management; cost categories; budget-revision decisions (never own); audit review.
- Pattern: load resource → get its `project_id` → `assertProjectAccess(user, projectId, 'view' | 'manage')`. Out of scope → 404. In scope but role insufficient → 403.

## Financial definitions (apply exactly; implemented once in SQL)

- Current approved budget = initial approved budget + Σ **approved** budget revisions. Pending/rejected have no effect.
- Actual spend = Σ **posted** cost transactions with `txn_date <= asOf` (reversal entries subtract). Drafts excluded.
- Remaining = current budget − actual. Utilization = actual / NULLIF(current budget, 0) → `null` when budget is 0.
- Forecast-to-complete (FTC) = Σ forecasts for months **after** the asOf month.
- EAC = actual + FTC. Projected variance = current budget − EAC (negative = overrun).
- Project with no forecast rows: FTC = 0, EAC = actual, flag `forecastMissing: true`.
- Approved change requests never auto-create costs or budget revisions.
- Reporting date default `2026-09-30` (from `app_settings.reporting_date`; API accepts `?asOf=`).
- Posted costs are immutable: no update/delete; corrections via a `reversal` entry linked by `reverses_id`.

## Transactions & audit

Any mutation that must be atomic with its history uses `withTx`: e.g. CR decision + `change_history` row + `audit_events` row; cost posting + audit row. `writeAudit(client, { actorId, entityType, entityId, action, projectId, before, after, requestId })` is called with the **same client**. Never write audit outside the transaction.

## Testing rules

- Vitest + supertest; tests hit `buildApp()` and the real `ppfc_test` DB (reset via migrate + CSV import in global setup, `fileParallelism: false`).
- Each feature adds tests for: happy path, validation failure, authorization denial, and its key business rule.
- Use helpers in `tests/helpers/` (`loginAs(role|email)`, `api()`, `resetDb()`). Seeded demo users are documented in `docs/demo-accounts.md`.
- A feature is not done until `npm run typecheck && npm run lint && npm test` all pass.

## Git

- Conventional commits: `feat(finance): post cost with audit in one transaction`. One feature file = one or more focused commits. Never commit `.env`.

## Do not

- Add an ORM, a new framework, or a dependency not listed above without asking.
- Compute KPIs in the frontend or patch numbers client-side.
- Join tasks/risks/costs directly to projects in one aggregate query (fan-out inflation). Aggregate each fact in its own CTE, then join.
- Put secrets, real people, or real company names in code or data.
- Silently skip a failing test or weaken an assertion to make it pass.
