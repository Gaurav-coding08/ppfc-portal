# 01 — Project setup, Docker Compose & test harness

## Goal
A runnable, empty-but-production-shaped backend: TypeScript + Express app factory, Postgres in Docker Compose (dev DB + test DB), env validation, logging with request IDs, the standard error format, and a working Vitest + supertest harness.

## Depends on
None.

## Spec references
Assignment 2 §3.2 (maintainability), §3.5 (logging, correlation id, Git, setup, env example, Docker Compose optional), §10.

## Scope

1. **Repo root**
   - `git init`, `.gitignore` (node_modules, dist, .env, coverage, *.log), `.editorconfig`.
   - `README.md` skeleton: project name, one-paragraph purpose, prerequisites (Node 20, Docker), quick start (filled in more by later features).
   - `docker-compose.yml`:
     - `db`: `postgres:16-alpine`, host port `5433:5432`, env `POSTGRES_USER=ppfc`, `POSTGRES_PASSWORD=ppfc_dev_pw`, `POSTGRES_DB=ppfc`, named volume, healthcheck `pg_isready`, mounts `./docker/postgres/init.sql` to `/docker-entrypoint-initdb.d/`.
     - `api` under `profiles: ["app"]` built from `backend/Dockerfile`, depends_on db healthy, env from `backend/.env`. (Dev normally runs the API with `npm run dev`; the profile proves containerised run.)
   - `docker/postgres/init.sql`: `CREATE DATABASE ppfc_test;` and create login role `ppfc_reader` (password `ppfc_reader_pw`, read-only grants come in feature 02).
2. **backend/**
   - `package.json` scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `test`, `test:watch`, plus placeholders `db:migrate`, `data:generate`, `db:import`, `db:reset` (wired in 02/03).
   - `tsconfig.json` strict, ESM (`"module": "NodeNext"`), `outDir: dist`.
   - ESLint (typescript-eslint recommended) + Prettier config.
   - `Dockerfile` (multi-stage: build → `node dist/server.js`).
   - `.env.example`: `NODE_ENV, PORT=4000, DATABASE_URL=postgres://ppfc:ppfc_dev_pw@localhost:5433/ppfc, DATABASE_URL_TEST=postgres://ppfc:ppfc_dev_pw@localhost:5433/ppfc_test, JWT_SECRET, JWT_EXPIRES_IN=8h, CORS_ORIGINS=http://localhost:5173, COOKIE_SECURE=false, REPORTING_DATE=2026-09-30, LOG_LEVEL=info`.
3. **src/**
   - `config/env.ts`: zod-validated env; crash at boot with a readable message if invalid. `NODE_ENV=test` uses `DATABASE_URL_TEST`.
   - `lib/logger.ts`: pino (pretty in dev, JSON otherwise, silent-ish in test).
   - `lib/errors.ts`: `AppError(status, code, message, details?)` plus helpers `badRequest, unauthenticated, forbidden, notFound, conflict, versionConflict, invalidTransition, selfApproval, businessRule`.
   - `middleware/requestId.ts`: read `x-request-id` or generate UUID; set on `req.id` and response header.
   - pino-http using `req.id` so every log line carries it.
   - `middleware/errorHandler.ts`: AppError → its status/code; ZodError → 400 `VALIDATION_ERROR` with field details; pg unique violation `23505` → 409, FK `23503` → 422, check `23514` → 422; anything else → 500 `INTERNAL` (log stack, never leak it). Always `{ error: { code, message, details?, requestId } }`.
   - `middleware/notFound.ts` → 404 JSON.
   - `db/pool.ts`: single `pg.Pool`; parse NUMERIC as string (default) — documented; `closePool()` for tests.
   - `db/tx.ts`: `withTx<T>(fn: (client) => Promise<T>)` — BEGIN/COMMIT, ROLLBACK on throw, always release.
   - `app.ts`: `buildApp()` — helmet, cors (allowlist from env, credentials true), express.json (limit 100kb), cookie-parser, requestId, pino-http, routes under `/api/v1`, notFound, errorHandler. `GET /api/v1/health` → `{ data: { status: "ok", db: "up" } }` (runs `SELECT 1`).
   - `server.ts`: listen + graceful shutdown (SIGTERM/SIGINT close server and pool).
4. **tests/**
   - `vitest.config.ts`: `environment: node`, `fileParallelism: false`, `globalSetup: tests/helpers/globalSetup.ts`, `setupFiles` sets `NODE_ENV=test`.
   - `tests/helpers/globalSetup.ts`: placeholder that checks the test DB is reachable (migrate/import added in 02/03).
   - `tests/helpers/api.ts`: `api()` returns `supertest(buildApp())`.
5. **docs/**: create `api-routes.md` (table header only), `ai-dev-log.md` (title + intro line), `architecture.md` (stub with layer diagram in text).

## Tests
- `integration/health.test.ts`: `GET /api/v1/health` → 200, body shape, `x-request-id` header present; incoming `x-request-id` is echoed back.
- `integration/errors.test.ts`: unknown route → 404 JSON with `requestId`.
- `unit/errors.test.ts`: errorHandler maps ZodError → 400 VALIDATION_ERROR, unknown Error → 500 INTERNAL without stack in body.
- `unit/tx.test.ts`: `withTx` rolls back when the callback throws (insert into a temp table, throw, assert 0 rows).

## Acceptance
```
docker compose up -d db
cd backend && cp .env.example .env && npm install
npm run typecheck && npm run lint && npm test
npm run dev   # then: curl -i localhost:4000/api/v1/health
```

## Out of scope
Schema, auth, any business endpoint.

## Interview talking points
Why an app factory (`buildApp`) separate from `listen` (testability); how request IDs flow into logs and errors; why errors never leak stacks; why pg errors are mapped centrally.
