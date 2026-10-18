# AI development log

This file records, feature by feature, how AI assistance was used to build the PPFC Portal:
what was asked, what the first attempt got wrong (if anything), how it was fixed, and how it
was verified. Each entry ends with a `Human review` line for the project owner to fill in.

### 01 Project setup, Docker Compose & test harness — 2026-10-18

- **Goal:** A runnable, empty-but-production-shaped backend: Express app factory, Postgres in
  Docker Compose (dev + test DB), env validation, request-id logging, the standard error
  format, and a working Vitest + supertest harness.
- **Prompt/approach:** `/run-feature` with the feature 01 spec + CLAUDE.md conventions.
- **First output issue:** Wired `.env` loading via `NODE_OPTIONS=--env-file=.env` for the
  `test`/`dev` scripts; Node rejects `--env-file` specifically inside `NODE_OPTIONS`
  ("not allowed in NODE_OPTIONS"), so `npm test` failed immediately at startup.
- **Refinement:** Passed `--env-file=.env` directly as a CLI flag to `tsx`/`node` instead
  (`tsx --env-file=.env ...`), which both tools accept natively. Also split `tsconfig.json`
  (typecheck, includes tests/scripts) from a new `tsconfig.build.json` (`rootDir: src` only)
  after discovering the first build emitted `dist/src/server.js` instead of `dist/server.js`,
  which didn't match the Dockerfile/`start` script's expected path.
- **Verification:** `npm run typecheck && npm run lint && npm test` all pass (6 tests);
  `npm run dev` + `curl -i localhost:4000/api/v1/health` returns 200 with `x-request-id`;
  `npm run build && node --env-file=.env dist/server.js` serves the same endpoint from the
  compiled output; `docker compose up -d db` brings up Postgres with `ppfc` + `ppfc_test`
  created; `docker compose --profile app build api` builds the containerized API image
  successfully (not run end-to-end in Compose — see context file for why).
- **Human review:** Read app.ts, errorHandler and withTx. Verified health and 404 via curl,
  confirmed x-request-id is echoed. No changes needed.

### 02 Database schema, migrations & financial SQL functions — 2026-10-18

- **Goal:** Complete relational model for all modules, a migration runner, financial KPI
  functions (single SQL source of truth), convenience views for Power BI, and schema-level
  tests including a full finance KPI fixture.
- **Prompt/approach:** /run-feature 02 with feature spec + CLAUDE.md + feature 01 context.
- **First output issue:** None found — all 8 migrations applied cleanly on both dev and test
  DBs, and all 12 tests (6 new schema tests + 6 existing) passed on first run.
- **Refinement:** N/A.
- **Verification:** `npm run db:migrate` and `npm run db:migrate:test` both applied 8
  migrations; `npm run typecheck && npm run lint && npm test` all pass (12 tests); ppfc_reader
  can `SELECT * FROM v_project_financials` but cannot INSERT (permission denied); finance KPI
  test verifies exact values (current_budget 1200, actual 300, remaining 900, utilization 0.25,
  FTC 200, EAC 500, variance 700); zero-budget project returns null utilization.
- **Human review:** Asked for boundary tests the AI's fixture missed (reversals, posted DELETE,
  asOf-month forecast, future-dated revision, revision self-approval). This surfaced a real bug:
  prevent_posted_cost_mutation returned NEW for DELETE; NEW is NULL in DELETE triggers, so Postgres
  silently skipped every delete, including drafts, with no error. Fixed via 009_fix_posted_cost_trigger.sql
  (RETURN OLD on TG_OP='DELETE'); added a draft-delete-succeeds regression test. 17+ tests pass.

### 03 Synthetic data generator, CSV export & import — 2026-10-18

- **Goal:** A deterministic generator (faker seed 42, fixed reporting date) that writes the
  full demo dataset to `data/csv/*.csv` with every mandatory edge case hand-placed, plus an
  importer that loads those same CSVs into Postgres, wired into the test harness.
- **Prompt/approach:** `/run-feature 03` with the feature spec + CLAUDE.md + feature 02 context.
- **First output issue:** A reversal's `reverses_id` was wired to the wrong array index — the
  `reversesFixedIndex` constant pointed at the reversal row itself (index 27) instead of the
  expense row it corrects (index 26), which would have linked a reversal to its own id. Caught
  by hand-counting the fixture array before running anything, not by a failing test.
- **Refinement:** Fixed the index before first run. Separately, a `change_requests` builder
  used `id: id++` and then read the now-incremented `id` again in the same object literal for
  the `code` field, producing codes one higher than the row's actual id (e.g. row id 1 got code
  `CR-002`). Refactored into a `buildCr()` helper that takes the id as a parameter, removing the
  double-read entirely.
- **Verification:** `npm run data:generate` run twice — `diff -rq` on the two output
  directories is identical (determinism confirmed before writing the unit test). `npm run
db:reset && npm run db:import:test` load cleanly. Hand-checked every edge case against
  `v_project_financials` and direct queries before trusting it to a test (near-budget 93.75%,
  forecast-exceed EAC 110,000 > budget 100,000, reversal net 0 on its pair, forecastMissing
  project has EAC = actual, etc.) — all matched the intended fixture numbers exactly.
  `npm run typecheck && npm run lint && npm test` all pass (50 tests, up from 17).
- **Human review:** Reviewed the context file's "Decisions & trade-offs" and caught a design flaw
  the AI had documented as intentional: business timestamps were omitted from the CSVs, so import
  stamped them with now(). Impact: every CR appeared submitted on the import date (after the
  2026-09-30 reporting date), so a Jan–Sep filter would return zero CRs; CR history and audit
  events shared one timestamp (approved before submitted); the DB differed on every import,
  breaking SQL/dashboard/Power BI reconciliation. Also flagged sparse monthly spend (~half the
  costs were draft filler). Re-prompted for deterministic historical timestamps and ~75% posted
  costs with pinned edge cases preserved. Result: 68/90 costs posted, posted spend in every month
  Jan–Sep, all five financial edge cases unchanged, 4 new consistency tests (54 pass). Reviewing
  the fix, rejected the AI's workaround of downgrading done tasks / closed risks with future due
  dates to blocked/mitigating: the real rule is completed_at ≤ reporting date, and early
  completion is valid. Restored statuses with past completion dates and added a regression test.

### 04 Authentication — 2026-10-18

- **Goal:** Real sign-in for seeded demo users: login/logout/me, httpOnly JWT cookie + Bearer
  fallback, role re-read from the DB on every request (not trusted from the token), no user
  enumeration, login rate limiting, login audit events.
- **Prompt/approach:** /run-feature 04 with feature spec + CLAUDE.md.
- **First output issue:** Manually curling the finished endpoint (not just the test suite) to
  check the acceptance command surfaced a real bug the tests had silently papered over: `pg`
  returns `BIGINT` columns as strings by default, so `POST /auth/login` returned
  `"id": "1"` (a string) even though every repository type in the module declared `id: number`.
  The integration tests still passed because both sides of every id comparison (e.g.
  `res.body.data.user.id` against another id read the same way) were consistently strings, so
  the mismatch never tripped an assertion — it would only have surfaced later, e.g. in feature
  05's authorization checks comparing a loaded resource's numeric owner_id to req.user.id.
- **Refinement:** Registered a `pg` type parser for OID 20 (int8/bigint) in `src/db/pool.ts`,
  safe here because every id in this schema is a small sequential IDENTITY value, not a
  precision-sensitive value like money (which deliberately stays string-typed). Added
  `setupFiles: ['src/db/pool.ts']` to `vitest.config.ts` so the parser is registered before any
  test file's own raw `pg.Client` queries run too — `globalSetup` runs in a separate
  process/context from the actual test workers, so doing it there wouldn't have reached them.
- **Verification:** `npm run typecheck && npm run lint && npm test` (68 tests, up from 55).
  Manually exercised the full flow against the real dev server after the fix: login (cookie set,
  numeric `id`/`departmentId` in the body), `/me` via cookie and via Bearer, `/me` with no
  token (401), logout (cookie cleared, subsequent `/me` on the same agent back to 401).
- **Human review:** Verified the bigint fix scope: ids and counts now parse to numbers, NUMERIC
  money stays string; recorded the convention in CLAUDE.md so later features rely on it.
  Manually checked security behaviour the tests don't cover: identical response for unknown
  email vs wrong password; JWT payload contains only sub (no role); cookie HttpOnly +
  SameSite=Lax; login rate limit returns 429 on the 11th attempt. Found a design limitation:
  logout only clears the cookie, so a copied Bearer token stays valid until expiry (stateless
  JWT); deactivation does revoke immediately because the user is re-read per request.
