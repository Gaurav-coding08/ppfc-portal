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
- **Human review:** TODO (owner)
