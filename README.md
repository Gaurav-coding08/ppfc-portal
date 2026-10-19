# Keel — Portfolio & Financial Control

Internal PMO application for managing projects, tasks, milestones, risks, change-request
approvals, project finance (budgets, costs, forecasts, EAC) and an executive analytics
dashboard.

| Dashboard | Project finance |
|---|---|
| ![Executive dashboard](docs/screenshots/dashboard.png) | ![Project finance tab](docs/screenshots/finance-tab.png) |
| **Project detail** | **Change request detail** |
| ![Project detail](docs/screenshots/project-detail.png) | ![Change request detail](docs/screenshots/change-request-detail.png) |

## Ports at a glance

| What | URL | Started by |
|---|---|---|
| PostgreSQL | `localhost:5433` | `docker compose up -d db` |
| API (dev) | `http://localhost:4000` | `cd backend && npm run dev` |
| SPA (dev, proxies `/api` → 4000) | `http://localhost:5173` | `cd frontend && npm run dev` |
| API (container) | `http://localhost:4000` (`API_PORT` to change) | `docker compose --profile app up -d --build` |
| SPA (container, nginx, proxies `/api` → `api`) | `http://localhost:8080` (`WEB_PORT` to change) | same |

## Prerequisites

- **Node.js 20 LTS** (`node -v` should print `v20.x`)
- **Docker** and **Docker Compose** (for PostgreSQL, and optionally the whole stack)

## Quick start

```bash
# 1. Start PostgreSQL (port 5433 to avoid conflicts with a local Postgres on 5432)
docker compose up -d db

# 2. Set up the backend
cd backend
cp .env.example .env          # review and adjust if needed
npm install

# 3. Migrate, generate seed data, and import
npm run db:reset               # runs db:migrate + db:import

# 4. Verify
npm run typecheck && npm run lint && npm test

# 5. Start the dev server
npm run dev                    # API on http://localhost:4000
curl -i localhost:4000/api/v1/health
```

## Running the frontend

The frontend (`frontend/`) is a Vite + React SPA that talks only to the backend's
`/api/v1`. Run both at once, in two terminals:

```bash
# Terminal 1 — backend (from repo root)
cd backend && npm run dev              # http://localhost:4000

# Terminal 2 — frontend (from repo root)
cd frontend && npm install
npm run dev                            # http://localhost:5173
```

Vite's dev server proxies `/api` to `http://localhost:4000` (see `frontend/vite.config.ts`),
so the browser only ever talks to `localhost:5173` — no CORS to configure in dev. Open
`http://localhost:5173` and log in with any account from [docs/demo-accounts.md](docs/demo-accounts.md)
(password `Demo@1234` for all of them; the login page also lists a few for convenience).

Regenerate the typed API client after any backend route/schema change:

```bash
cd frontend && npm run api:types       # docs/openapi.yaml → src/api/schema.ts
```

Frontend commands: `npm run dev|build|preview|typecheck|lint|format|test|test:watch|test:e2e|api:types`.
Frontend gate: `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`.

Demo logins for the UI (password `Demo@1234`): admin `garnet.wiegand@ppfc.demo`,
project manager `christelle.satterfield@ppfc.demo` (owns PRJ-001/004/007), contributor
`estell.conroy@ppfc.demo` (member of PRJ-001/008). More in [Demo accounts](#demo-accounts).

## Running the whole stack in Docker

```bash
docker compose --profile app up -d --build     # db + api + worker + web
open http://localhost:8080
```

`web` is built by `frontend/Dockerfile` (Node build → nginx serving `dist/`). nginx also
proxies `/api` to the `api` service, so the browser sees a single origin, the same way the
Vite proxy works in dev. If `npm run dev` is already using port 4000 on the host, publish the
container API elsewhere: `API_PORT=4001 docker compose --profile app up -d --build` (the SPA
reaches the API over the compose network either way). Stop with
`docker compose --profile app down` (the `db` volume is kept).

## End-to-end tests (Playwright)

The smoke suite in `frontend/e2e/` drives a **running** stack with the seeded data. It does
not start servers itself.

```bash
cd frontend
npx playwright install chromium        # once
npm run test:e2e                        # against http://localhost:8080 (Docker stack)
E2E_BASE_URL=http://localhost:5173 npm run test:e2e   # against the dev servers instead
npx playwright show-report              # HTML report of the last run
```

What it covers:
- **Journeys** (`e2e/journeys/`), one per acceptance test A–E:
  - PM creates a project and a task; the contributor updates progress, which persists across a reload.
  - PM posts a draft cost; actual spend rises and the drill-down lists the cost.
  - PM approves a CR; exactly one history entry is added.
  - A contributor sees no Post/Decide actions.
  - Dashboard department filter → finance drill-down count = API total.
- **Quality** (`e2e/quality/`):
  - every page at 1440/1024/768/390 px, checked for no horizontal page scroll, an accessible name on every control, and WCAG AA text contrast (screenshots land in `frontend/test-results/layout/`);
  - a keyboard-only walk: project → task edit → cost post → CR decision.

Notes:
- **It writes to the dev database:** new `E2E …` projects, costs and CR decisions.
  `cd backend && npm run db:reset` restores the seed.
- **Sessions are reused.** The setup step signs in each role through the login form once and
  keeps the session cookie in `frontend/e2e/.auth/` (git-ignored) while it's valid, because
  the API allows only 10 logins per 15 minutes per IP.
- **Screenshots:** `SCREENSHOTS=1 npx playwright test screenshots` regenerates
  `docs/screenshots/`. Best right after `db:reset`.

## Environment variables

All config lives in `backend/.env` (never committed — `.gitignore`d). Copy `.env.example`
and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` | `4000` | API listen port |
| `DATABASE_URL` | `postgres://ppfc:ppfc_dev_pw@localhost:5433/ppfc` | Dev database |
| `DATABASE_URL_TEST` | `postgres://ppfc:ppfc_dev_pw@localhost:5433/ppfc_test` | Test database |
| `JWT_SECRET` | `change-me-in-a-real-deployment` | HMAC secret for JWTs |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime (e.g. `8h`, `30m`, `1d`) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `COOKIE_SECURE` | `false` | Set `true` in production (HTTPS only) |
| `REPORTING_DATE` | `2026-09-30` | Default asOf date for financial queries |
| `LOG_LEVEL` | `info` | pino log level |
| `AUTOMATION_CRON` | `*/5 * * * *` | Schedule for `npm run worker`'s overdue-escalation + dispatcher pass |
| `AUTOMATION_MAX_ATTEMPTS` | `3` | Outbox delivery attempts before an event is marked `failed` |
| `AUTOMATION_ENABLED` | `true` | Set `false` to start the worker process without scheduling anything |

## Available commands (run from `backend/`)

```bash
npm run dev                    # Start dev server (tsx watch)
npm run worker                 # Start the automation scheduler (tsx watch) — see docs/automation.md
npm run automation:run         # One producer + dispatcher pass, prints the run summary
npm run build                  # Compile TypeScript → dist/
npm run start                  # Run compiled JS (production)
npm run typecheck              # tsc --noEmit
npm run lint                   # ESLint
npm run format                 # Prettier
npm test                       # Vitest (against ppfc_test DB)
npm run test:coverage          # Vitest with v8 coverage report
npm run db:migrate             # Apply migrations to DATABASE_URL
npm run db:migrate:test        # Apply migrations to DATABASE_URL_TEST
npm run data:generate          # Generate data/csv/*.csv (deterministic, seed 42)
npm run db:import              # Truncate + load CSVs into DATABASE_URL
npm run db:import:test         # Truncate + load CSVs into DATABASE_URL_TEST
npm run db:reset               # db:migrate + db:import
npm run routes:check           # Verify docs/api-routes.md matches the test route inventory
```

## Demo accounts

All seeded users share the same password: **`Demo@1234`**

| Email | Role |
|-------|------|
| `garnet.wiegand@ppfc.demo` | admin |
| `christelle.satterfield@ppfc.demo` | project_manager |
| `lavinia.crist@ppfc.demo` | project_manager |
| `isabell.bradtke@ppfc.demo` | project_manager |
| `estell.conroy@ppfc.demo` | contributor |

Full list with project memberships: [docs/demo-accounts.md](docs/demo-accounts.md)

## Data

The demo dataset is generated deterministically (`@faker-js/faker`, seed 42), so the
dev DB, test DB and any reporting tool see identical data:

```bash
npm run data:generate          # faker → data/csv/*.csv
npm run db:import              # truncate + load into DATABASE_URL
npm run db:reset               # migrate + import in one step
```

Regenerating is safe to run repeatedly — same seed produces byte-identical CSVs.
See [docs/data-dictionary.md](docs/data-dictionary.md) for the schema and edge-case catalogue.

The reporting date (`2026-09-30`) is what financial fixtures are built against. A real
deployment would use the current date or accept `?asOf=` on API calls.

## Project structure

```
ppfc-portal/
├── CLAUDE.md                  # Engineering spec and conventions
├── docker-compose.yml         # PostgreSQL + optional API/worker containers
├── docker/postgres/init.sql   # Creates ppfc_test DB + ppfc_reader role
├── data/csv/                  # Generated seed CSVs (committed)
├── docs/
│   ├── api-routes.md          # Route inventory table
│   ├── openapi.yaml           # OpenAPI 3.0 spec
│   ├── api-collection.json    # Postman collection with example calls
│   ├── e2e-checklist.md       # Manual acceptance test steps
│   ├── security.md            # Security design and hardening
│   ├── architecture.md        # Layer diagram and design decisions
│   ├── data-dictionary.md     # Schema, edge cases, seed data
│   ├── demo-accounts.md       # Seeded user accounts
│   ├── kpi-definitions.md     # Dashboard KPI definitions
│   ├── automation.md          # Outbox/dispatcher: trigger, rules, retry, demo evidence
│   └── ai-dev-log.md          # Build log
├── backend/
│   ├── db/migrations/         # Forward-only numbered SQL migrations
│   ├── scripts/               # migrate, generate-data, import-csv, routes-check, automation-run
│   ├── src/
│   │   ├── app.ts             # buildApp() — no listen(); used by tests
│   │   ├── server.ts          # listen() — the HTTP API
│   │   ├── worker.ts          # Automation scheduler entrypoint (node-cron)
│   │   ├── config/env.ts      # Validated environment
│   │   ├── db/                # pool.ts, tx.ts
│   │   ├── lib/                # errors, logger, audit, pagination, money, dates, access
│   │   ├── middleware/        # requestId, authenticate, authorize, validate, idempotency, rateLimit, errorHandler
│   │   └── modules/           # auth, admin, users, projects, tasks, milestones, risks,
│   │                          # change-requests, finance (budgets, costs, categories,
│   │                          # forecasts, summary), dashboard, automation, notifications
│   └── tests/
│       ├── helpers/           # api(), loginAs(), resetDb(), routeExtractor
│       └── integration/       # Feature tests, route-guard, rbac-matrix, id-escalation,
│                              # logging, health-down
└── frontend/                  # React + Vite SPA (feature 16+)
    ├── src/
    │   ├── app/                # App.tsx, providers, router, queryClient
    │   ├── api/                # schema.ts (generated), client.ts, errors.ts, queryKeys.ts
    │   ├── auth/                # AuthProvider, useAuth, RequireAuth, can.ts, LoginPage
    │   ├── components/
    │   │   ├── ui/              # shadcn-generated primitives (light edits only)
    │   │   ├── layout/          # AppShell, Sidebar, Topbar, PageHeader, nav config
    │   │   ├── data/             # DataTable, FilterBar, Pagination, Loading/Empty/ErrorState
    │   │   ├── form/              # FormField wrappers, ConfirmDialog, VersionConflictDialog
    │   │   └── display/           # StatusBadge, Money, Percent, DateText, ProgressBar, KpiCard
    │   ├── features/<module>/     # One folder per backend module (placeholders until built)
    │   ├── lib/                    # format.ts, cn.ts, idempotency.ts, useUrlFilters, useDebouncedValue
    │   └── test/                    # setup.ts, msw handlers/server, render helper
    └── vite.config.ts              # /api → localhost:4000 dev proxy
```

## API documentation

- **Route table**: [docs/api-routes.md](docs/api-routes.md)
- **OpenAPI spec**: [docs/openapi.yaml](docs/openapi.yaml)
- **Postman collection**: [docs/api-collection.json](docs/api-collection.json)
- **Automation (feature 15)**: [docs/automation.md](docs/automation.md)

Base path: `/api/v1`. All responses follow the conventions in CLAUDE.md.

## Troubleshooting

### Port 5433 already in use

Another Postgres (or a stale container) is on port 5433:

```bash
docker compose down
docker compose up -d db
```

Or change the port mapping in `docker-compose.yml` and update `DATABASE_URL` in `.env`.

### Reset the database

```bash
cd backend
npm run db:reset               # migrate + re-import seed data
```

To fully wipe and recreate:

```bash
docker compose down -v         # removes the volume
docker compose up -d db        # fresh DB
cd backend && npm run db:reset
```

### Tests fail with "relation does not exist"

The test DB hasn't been migrated. Run:

```bash
npm run db:migrate:test
npm run db:import:test
```

### "DATABASE_URL_TEST is not set"

Make sure `backend/.env` exists and has `DATABASE_URL_TEST`. Copy from `.env.example`.

### Docker containers for the API, worker and web

```bash
docker compose --profile app up -d --build
curl -i localhost:4000/api/v1/health
curl -i localhost:8080/api/v1/health    # same API, through the web container's nginx
docker logs <worker-container-name>   # confirms the scheduled automation pass
```

This builds the backend Dockerfile once and runs it as two containers: `api`
(the HTTP server) and `worker` (the automation scheduler, `node dist/worker.js`
— see [docs/automation.md](docs/automation.md)). Both override `DATABASE_URL`
in `docker-compose.yml` to point at the `db` service's internal hostname —
`backend/.env`'s own `DATABASE_URL` is for the host (`npm run dev`), where
Postgres is published on `localhost:5433`, which isn't reachable from inside
the compose network.
