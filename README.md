# PPFC Portal — Project Portfolio & Financial Control Portal

Internal PMO application for managing projects, tasks, milestones, risks, change-request
approvals, project finance (budgets, costs, forecasts, EAC) and an executive analytics
dashboard.

## Prerequisites

- **Node.js 20 LTS** (`node -v` should print `v20.x`)
- **Docker** and **Docker Compose** (for PostgreSQL)

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
└── frontend/                  # Later phase
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

### Docker containers for the API and worker

```bash
docker compose --profile app up -d --build
curl -i localhost:4000/api/v1/health
docker logs <worker-container-name>   # confirms the scheduled automation pass
```

This builds the backend Dockerfile once and runs it as two containers: `api`
(the HTTP server) and `worker` (the automation scheduler, `node dist/worker.js`
— see [docs/automation.md](docs/automation.md)). Both override `DATABASE_URL`
in `docker-compose.yml` to point at the `db` service's internal hostname —
`backend/.env`'s own `DATABASE_URL` is for the host (`npm run dev`), where
Postgres is published on `localhost:5433`, which isn't reachable from inside
the compose network.
