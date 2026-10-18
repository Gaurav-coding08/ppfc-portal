# PPFC Portal — Project Portfolio & Financial Control Portal

Internal PMO application for managing projects, tasks, milestones, risks, change-request
approvals, project finance (budgets, costs, forecasts, EAC) and an executive analytics
dashboard. Built as a take-home assignment; see `CLAUDE.md` for the full engineering spec.

## Prerequisites

- Node.js 20 LTS
- Docker (for Postgres via Docker Compose)

## Quick start

```bash
docker compose up -d db
cd backend
cp .env.example .env
npm install
npm run db:reset      # migrate + import seed data (added in features 02/03)
npm run typecheck && npm run lint && npm test
npm run dev            # then: curl -i localhost:4000/api/v1/health
```

## Data

The demo dataset is generated, not hand-typed, so the dev DB, the test DB and any Power BI
report built against it all see identical data:

```bash
npm run data:generate       # faker (seed 42) -> data/csv/*.csv, deterministic output
npm run db:import           # truncate + load data/csv/*.csv into DATABASE_URL
npm run db:import:test      # same, into DATABASE_URL_TEST
npm run db:reset            # db:migrate + db:import, in one step
```

Regenerating (`npm run data:generate`) is safe to run repeatedly — same seed and fixed
dates produce byte-identical CSVs, so `git diff --stat data/csv` shows no changes after
the first commit. Every mandatory edge case (near-budget project, overdue tasks, a
reversal entry, etc.) is a deliberately placed fixture, not left to chance — see
`docs/data-dictionary.md` → "Edge-case catalogue" for the full map, and
`docs/demo-accounts.md` for seeded logins.

The reporting date (`2026-09-30` by default, from `app_settings.reporting_date`) is what
all the financial fixtures are built against. A real deployment would use the current
date, or let the caller pass `?asOf=` on the API — this app always accepts both.

## Repo layout

See `CLAUDE.md` for the full repo layout, API conventions, roles/authorization model and
financial definitions.
