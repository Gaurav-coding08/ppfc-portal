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

## Repo layout

See `CLAUDE.md` for the full repo layout, API conventions, roles/authorization model and
financial definitions.
