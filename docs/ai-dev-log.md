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
- **Human review:** TODO (owner)
