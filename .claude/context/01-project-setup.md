# 01 — Project setup, Docker Compose & test harness (done 2026-10-18)

## What exists now
A runnable, empty-but-production-shaped Express + TypeScript backend: app factory (`buildApp`)
separate from `listen`, Postgres in Docker Compose (dev `ppfc` DB + `ppfc_test` DB), zod-validated
env config, pino logging with request-id correlation, the standard `{ error: {...} }` shape,
`withTx` for transactions, and a working Vitest + supertest harness that talks to the real test
DB. No schema, auth, or business endpoints yet — just `GET /api/v1/health`.

## Files
- `docker-compose.yml`, `docker/postgres/init.sql` — Postgres 16 (`db`, port 5433) + `api` profile; init script creates `ppfc_test` and the `ppfc_reader` role (grants added in 02).
- `backend/package.json` — scripts use `tsx --env-file=.env` (not `NODE_OPTIONS`, which rejects `--env-file`) to load `.env` for dev/test/scripts; `start` uses `node --env-file=.env`.
- `backend/tsconfig.json` — strict, NodeNext ESM, `noUncheckedIndexedAccess`; includes `src`, `tests`, `scripts`, `vitest.config.ts` (needed for ESLint's typed-linting to cover the vitest config).
- `backend/tsconfig.build.json` — extends the above but narrows to `rootDir: src`, `include: ["src"]` so `dist/server.js` lands at the top level (not `dist/src/server.js`); used only by `npm run build`.
- `backend/.eslintrc.cjs`, `.prettierrc.json` — typescript-eslint recommended + prettier.
- `backend/src/config/env.ts` — zod schema; `env.databaseUrl` picks `DATABASE_URL_TEST` when `NODE_ENV=test`; `env.corsOrigins` is the parsed array.
- `backend/src/lib/logger.ts` — pino; silent in test, pretty in dev, JSON otherwise.
- `backend/src/lib/errors.ts` — `AppError` + helpers (`badRequest, unauthenticated, forbidden, notFound, conflict, versionConflict, invalidTransition, selfApproval, businessRule`).
- `backend/src/middleware/{requestId,notFound,errorHandler}.ts` — request-id correlation, 404 JSON, centralized error mapping (AppError, ZodError, pg 23505/23503/23514, fallback 500).
- `backend/src/db/{pool,tx}.ts` — single `pg.Pool`, `closePool()`, `withTx<T>`.
- `backend/src/app.ts` / `server.ts` — `buildApp()` (helmet, cors allowlist+credentials, json 100kb, cookie-parser, requestId, pino-http, `/api/v1/health`, notFound, errorHandler) and `server.ts` (listen + SIGTERM/SIGINT graceful shutdown).
- `backend/scripts/{migrate,generate-data,import-csv}.ts` — placeholders logging "not implemented yet"; real logic lands in 02/03.
- `backend/tests/helpers/{globalSetup,api}.ts` — globalSetup just pings the test DB (replaced with migrate+import in 02/03); `api()` wraps `supertest(buildApp())`.
- `backend/tests/{unit,integration}/*.test.ts` — health, 404, errorHandler unit tests, `withTx` rollback test.
- `docs/{api-routes,ai-dev-log,architecture}.md` — stubs/headers only.

## Database
- `ppfc` (dev) and `ppfc_test` databases exist via `docker/postgres/init.sql`; no tables yet (feature 02).
- `ppfc_reader` login role created but has no grants yet (feature 02 grants against real tables).

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/health | public | `{ data: { status: "ok", db: "up" } }`; runs `SELECT 1`. |

## Reusable pieces (use these, don't rebuild)
- `buildApp()` — `src/app.ts` — Express app factory; import directly in tests, never call `.listen()` in tests.
- `withTx<T>(fn)` — `src/db/tx.ts` — wraps a callback in BEGIN/COMMIT/ROLLBACK with a pooled client; pass `client` down to repositories.
- `AppError` + helpers — `src/lib/errors.ts` — throw these from services/controllers; `errorHandler` turns them into the standard response.
- `api()` — `tests/helpers/api.ts` — supertest-wrapped app for integration tests.
- `pool` / `closePool()` — `src/db/pool.ts` — the only `pg.Pool` instance; NUMERIC columns stay strings (no custom type parser) — convert to money carefully in later features.

## Decisions & trade-offs
- `--env-file` passed as a CLI flag to `tsx`/`node` directly, not via `NODE_OPTIONS`: Node rejects `--env-file` inside `NODE_OPTIONS` ("not allowed in NODE_OPTIONS"), discovered while wiring `npm test`. The `test` script now runs `tsx --env-file=.env node_modules/.bin/vitest run` so DATABASE_URL/DATABASE_URL_TEST are available before vitest's own config loads.
- `test.env.NODE_ENV = 'test'` is additionally set in `vitest.config.ts` so `NODE_ENV` is correct even though `.env` itself defaults it to `development`; verified empirically that `env.databaseUrl` resolves to the `ppfc_test` connection string during `npm test`.
- Split `tsconfig.json` (typecheck target, includes tests/scripts) from `tsconfig.build.json` (production build, `src` only, flat `rootDir`) — otherwise `tsc` either fails ESLint's typed-linting on `vitest.config.ts` or ships test files into `dist/`.
- pg error code mapping in `errorHandler.ts`: 23505 (unique_violation) is mapped to `IDEMPOTENCY_CONFLICT` as a 409 fallback since the CLAUDE.md error-code enum has no generic "duplicate" code and this is a last-resort safety net — services should proactively detect and report duplicates with the more specific code for the situation (e.g. `VERSION_CONFLICT` for optimistic locking) before hitting this fallback.
- The `api` Docker Compose profile builds successfully (`docker compose --profile app build api`) and produces the same `dist/server.js` verified directly with `node --env-file=.env dist/server.js`; it was not run end-to-end inside Compose in this feature because doing so requires editing the local `.env`'s `DATABASE_URL` host from `localhost` to `db`, which the sandbox blocks as a sensitive-file edit. Acceptance for this feature only requires `docker compose up -d db`, which was run and verified.

## Known gaps / TODO for later features
- `scripts/{migrate,generate-data,import-csv}.ts` are placeholders — feature 02 implements migrate, feature 03 implements the other two.
- `tests/helpers/globalSetup.ts` only pings the DB — feature 02/03 should make it run migrate + CSV import so every test run starts from seeded state.
- No `lib/pagination.ts`, `lib/money.ts`, `lib/dates.ts`, `lib/audit.ts`, or `middleware/{authenticate,authorize,validate,idempotency}.ts` yet — later features add these as needed.

## How to verify quickly
```
docker compose up -d db
cd backend && cp .env.example .env && npm install
npm run typecheck && npm run lint && npm test
npm run dev   # then: curl -i localhost:4000/api/v1/health
```
