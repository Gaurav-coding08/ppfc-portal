# 14 — Backend hardening, API documentation & quality sweep

## Goal
Close the backend phase: a complete, verified route list (OpenAPI), a security review pass on every route, a request-validation sweep, the manual end-to-end checklist, and a full green test suite. After this, the frontend can be built against a stable contract.

## Depends on
13-dashboard-analytics (and therefore all earlier features)

## Spec references
Assignment 2 §3.2 (route list / OpenAPI), §3.4 (authorize every route, injection, tokens, cookies, CORS), §3.5 (logging, error handling, ≥ 5 automated checks, manual E2E checklist, Git, setup, env example), §10 acceptance A–E, H.

## Scope

1. **Route inventory test** — `integration/route-guard.test.ts`: enumerate the Express router stack, and assert every route except `/health` and `/auth/login` returns 401 without a token. Fails automatically if a future route forgets `authenticate`.
2. **Authorization sweep** — for each mutation route, assert member-contributor gets 403/404 per the role × action matrix in `docs/security.md` (table-driven test `integration/rbac-matrix.test.ts`).
3. **Cross-project ID escalation** — table-driven test: a PM of project A calls every `/:id` route with an id belonging to project B → 404, data unchanged.
4. **OpenAPI** — `docs/openapi.yaml` (hand-written or generated from zod via `@asteasolutions/zod-to-openapi`; ask before adding the dep). Include every route, auth scheme (cookie + bearer), request/response schemas, error schema. Also export a Postman/Bruno collection to `docs/api-collection.json` with example calls for acceptance tests A–E.
5. **docs/api-routes.md** — verify it matches the router (script `npm run routes:check` that diffs router stack vs doc table).
6. **Security pass** — confirm and document in `docs/security.md`: helmet headers, CORS allowlist + credentials, cookie flags, body size limit, rate limit on login, parameterized SQL (grep for template literals in repositories → none with values), sort/identifier whitelists, no stack traces in responses, secrets only in env, `.env` gitignored, read-only DB role for BI.
7. **Logging pass** — every error log has `requestId`, `userId`, route, status; no passwords/tokens logged (pino `redact` for `req.headers.authorization`, `req.headers.cookie`, `*.password`).
8. **Graceful failure** — DB down → `/health` returns 503 with `db: "down"`; other routes 503 `INTERNAL` JSON, not a crash.
9. **docs/e2e-checklist.md** — manual checklist mapping each assignment acceptance test A–E and H to exact steps (login as X, call Y, expect Z, verify with SQL W).
10. **README** — full setup: prerequisites, `docker compose up -d db`, env, migrate, generate, import, run, test, demo accounts link, route docs link, project structure, troubleshooting (port 5433 in use, reset DB).
11. **Test report** — `npm run test:coverage` (v8); record totals in the context file. Target: every service file covered by at least one integration test.

## Tests
- `route-guard.test.ts`, `rbac-matrix.test.ts`, `id-escalation.test.ts` as above.
- `integration/logging.test.ts`: response to a failing request contains `requestId`; captured log line (pino destination stub) has the same id and no `authorization` header value.
- `integration/health-down.test.ts`: simulate pool failure (point a fresh app at a bad URL) → 503.

## Acceptance
```
npm run typecheck && npm run lint && npm test && npm run test:coverage && npm run routes:check
docker compose --profile app up -d --build && curl -i localhost:4000/api/v1/health
```

## Out of scope
Frontend, automation worker, Power BI, Access (later phases — see `.claude/features/README.md`).

## Design rationale
How you'd prove no route is unprotected (route-guard test); table-driven RBAC tests; log redaction; what happens when the DB goes down.
