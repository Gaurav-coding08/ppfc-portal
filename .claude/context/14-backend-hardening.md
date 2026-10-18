# 14 — Backend hardening, API documentation & quality sweep (done 2026-10-18)

## What exists now
The backend phase is complete. Every route is verified to require authentication (except /health and /auth/login). A table-driven RBAC matrix test proves contributors cannot perform mutations. Cross-project ID escalation is blocked and tested. The API is documented with an OpenAPI 3.0 spec, a Postman collection, and a manual E2E checklist. Pino log redaction prevents sensitive headers from appearing in logs. The /health endpoint gracefully returns 503 when the DB is down. Coverage is at 91.25% statements.

## Files
- `backend/src/app.ts` — /health now returns 503 with `db: "down"` on pool failure
- `backend/src/lib/logger.ts` — added `redact` for authorization, cookie, password paths
- `backend/tests/helpers/routeExtractor.ts` — Express 4 router stack walker (unused by test directly but available)
- `backend/tests/integration/route-guard.test.ts` — 70 tests: every route returns 401 without token
- `backend/tests/integration/rbac-matrix.test.ts` — 23 tests: contributor blocked from mutations
- `backend/tests/integration/id-escalation.test.ts` — 23 tests: PM of project A cannot access project B resources
- `backend/tests/integration/logging.test.ts` — 3 tests: requestId in responses, no stack traces, redact config
- `backend/tests/integration/health-down.test.ts` — 1 test: 503 when DB unreachable
- `backend/scripts/routes-check.ts` — diffs api-routes.md against route-guard.test.ts inventory
- `backend/package.json` — added `test:coverage`, `routes:check` scripts; `@vitest/coverage-v8` dev dep
- `docs/openapi.yaml` — hand-written OpenAPI 3.0 spec, all 71 routes
- `docs/api-collection.json` — Postman collection with acceptance test A–E/H examples
- `docs/e2e-checklist.md` — manual E2E checklist mapping acceptance tests to exact steps
- `docs/security.md` — extended with hardening checklist section
- `README.md` — full setup, commands, demo accounts, project structure, troubleshooting

## Database
No new tables, migrations or schema changes.

## Endpoints
No new endpoints. Existing `/api/v1/health` behaviour changed: returns 503 `{ data: { status: "degraded", db: "down" } }` when DB is unreachable.

## Reusable pieces (use these, don't rebuild)
- `extractRoutes(app)` — walks Express 4 router stack, returns `{ method, path }[]`
- `routes-check.ts` script — run via `npm run routes:check` to verify doc matches code
- Route inventory in `route-guard.test.ts` — canonical list of all 71 routes; update when adding routes

## Decisions & trade-offs
- **Route inventory as code, not router introspection** — Express 4's internal regexp format is fragile to parse reliably across mount depths. A hand-maintained route list in the test file is explicit, serves as documentation, and is cross-checked by `routes:check` against `api-routes.md`.
- **OpenAPI hand-written** — avoided adding `@asteasolutions/zod-to-openapi` dependency since CLAUDE.md says to ask before adding deps. The hand-written spec covers all routes and is sufficient for Postman import.
- **Pino redact paths** — `req.headers.authorization`, `req.headers.cookie`, `*.password` cover the sensitive data paths. pino replaces them with `[Redacted]` in output.
- **Coverage provider** — `@vitest/coverage-v8` added as dev dependency (v8 is built into Node, no native compilation needed).

## Known gaps / TODO for later features
- No automated OpenAPI validation against actual response shapes (would need a test-time middleware or zod-to-openapi)
- Coverage of some shared service files (e.g. `risks.shared.ts`, `tasks.shared.ts`) is lower where list-query branches aren't fully exercised
- No Docker health check integration test (the `docker compose --profile app` acceptance step is manual)

## How to verify quickly
```bash
cd backend
npm run typecheck && npm run lint && npm test
npm run routes:check
npm run test:coverage   # 91.25% statements, 417 tests
```
