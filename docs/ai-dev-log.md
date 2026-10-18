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

### 05 Access control & shared platform helpers — 2026-10-18

- **Goal:** Reusable building blocks for every business module: role guards, project-scope
  checks, audit writer improvements, idempotency middleware, optimistic-lock helper,
  pagination/sort/filter parsing, and date/money helpers.
- **Prompt/approach:** /run-feature 05 with feature spec + CLAUDE.md + feature 04 context.
- **First output issue:** Initial typecheck failed with 14 errors: `pg.Client` (used in tests)
  is not assignable to `PoolClient` (which the function signatures required), and top-level
  `await import()` inside `describe` blocks is not allowed outside async functions.
- **Refinement:** Widened function signatures in `access.ts`, `audit.ts`, and `versioning.ts`
  to accept `Client | PoolClient` (safe because both expose the same `.query()` interface; the
  runtime always passes a PoolClient from `withTx`). Restructured test file to use top-level
  imports instead of dynamic `await import()` inside describe blocks. Also fixed lint errors:
  replaced `as any` casts with proper typed helpers (`toAuthUser()`, `as unknown as Request`).
- **Verification:** `npm run typecheck && npm run lint && npm test` all pass (99 tests, up from
  68). Confirmed: admin views any project; PM manages own, 404 on unrelated; member contributor
  views but can't manage (403); non-member contributor gets 404; idempotency replays stored
  response with header; stale version returns 409 with currentVersion; rolled-back audit leaves
  no row; password_hash stripped from audit payloads.
- **Human review:** Checked the idempotency middleware against concurrent use, which the tests
  didn't cover: the lookup → execute → store flow let two simultaneous requests with the same key
  (a double-click) both run the handler, since ON CONFLICT only prevented the second _store_.
  Added a concurrent-request test (failed: 2 rows), fixed by reserving the key as 'in_progress'
  before executing (duplicate → 409, released on error). Noted that cost posting is also protected
  by the draft→posted version check, so this is defence in depth. Confirmed `as unknown as` casts
  exist only in tests, and that sort columns are whitelisted (no identifier injection).

### 06 Admin: departments, users, roles & audit review — 2026-10-18

- **Goal:** Reference data (`departments`), a scoped user directory for assignee pickers, admin
  user create/update with the password policy and last-active-admin safeguard, and audit/activity
  review endpoints — every admin mutation atomic with its `audit_events` row.
- **Prompt/approach:** `/run-feature 06` with the feature spec + CLAUDE.md + feature 05 context.
- **First output issue:** The "PM sees only users on projects they manage" test failed:
  `expected [...] to not include 10`. The feature 05 test fixture `asNonMember()` only guarantees
  non-membership on _one_ specific project, but the seeded PM in that fixture owns three projects
  whose combined membership happens to cover every seeded contributor — so there was no actual
  "unrelated" user for that PM/contributor pair to test against. A second, related issue: an
  earlier draft of the "promote to PM" test reused that same shared fixture contributor and
  permanently changed their role mid-file, which then made an unrelated "contributor gets 403"
  test fail later in the same run because the fixture no longer resolved to a contributor.
- **Refinement:** Wrote a dedicated query that finds a PM/contributor pair with no overlap across
  _every_ project that PM manages (not just one), and switched the "promote to PM" test to create
  its own disposable user via the admin-create endpoint instead of mutating the shared fixture.
- **Verification:** `npm run typecheck && npm run lint && npm test` all pass (117 tests, up from
  100). Confirmed: contributor/PM get 403 on all `/admin/*` routes; admin create → 201, login
  works, audit row's `request_id` matches the response header; duplicate email → 409; weak
  password → 400; self role-change/deactivate → 422; stale version → 409 with `currentVersion`;
  promoted user's existing token gains PM access on its very next request with no re-login; the
  last-active-admin guard blocks a non-self demote/deactivate that would leave zero admins
  (tested at the service layer, since the HTTP route's own admin-role gate makes a same-actor
  trigger of this specific guard unreachable — see the feature's context file for why); PM
  `/users` list and `/users/:id` are correctly scoped (404 outside scope); audit filter by
  entityType + date range works; `password_hash` never appears in any response body.
- **Human review:** Verified locally — typecheck/lint/test green (117), spot-checked PM user-scoping and self-demote 422 manually. No changes needed.

### 07 Projects & membership — 2026-10-18

- **Goal:** Project portfolio CRUD with scoped visibility, membership management, a computed
  delivery-status badge, and project-detail counts/budget headline — the feature's "PM creates a
  project" journey plus everything the later finance/task features will read.
- **Prompt/approach:** `/run-feature 07` with the feature spec + CLAUDE.md conventions, reusing
  feature 05/06's access/versioning/pagination/audit helpers and feature 02's existing
  `fn_project_progress`/`fn_project_financials` SQL functions.
- **First output issue:** Two caught before running anything. (1) `scopedProjectIdsSql`
  (feature 05) assumes the table being filtered has its own `project_id` FK column — fine for a
  future tasks/risks/costs list, but the `projects` table's own scoping key is `id`, so reusing it
  verbatim for the projects list would have silently scoped on the wrong column. Written as a
  hand-rolled `owner_id = $u OR EXISTS (...)` condition instead. (2) A real mapping bug in
  `projects.detail.repository.ts#findBudgetHeadline`: the SQL result has snake_case keys
  (`current_budget`, `actual_spend`) but the function's declared return type used camelCase
  (`currentBudget`, `actualSpend`), and the first draft returned `rows[0]` directly — every
  financial-headline field would have been `undefined` at runtime despite type-checking fine
  (`rows[0]` is typed as the query's generic, which TS doesn't cross-check against the function's
  separately-declared return interface). Fixed by mapping the row explicitly before returning.
- **Refinement:** Also split what would have been one ~310-line repository file and one
  ~330-line service file into four repository files and three service files by concern (reads /
  create-update writes / members / detail-only reads), each under CLAUDE.md's ~250-line limit, with
  small shared helpers (`isEligibleOwner`, `viewScopeFor`) lifted into `projects.shared.ts` so the
  two service files didn't duplicate them.
- **Verification:** `npm run typecheck && npm run lint && npm test` all pass (144 tests, up from
  117; 27 new). Confirmed: admin sees all 8+ seeded projects, a contributor's list exactly matches
  their `project_members` rows, a PM's list matches owned ∪ managed ∪ member; department/status/
  owner/date-range filters and name-sort/pagination meta are correct; a non-member contributor's
  `GET /:id` is 404 and a member's `PATCH` is 403; `progressPct` matches a weighted average
  hand-computed from the seeded `tasks` rows independently in the test; project create is one
  transaction (owner membership + budget + audit row all exist, and a forced budget-insert failure
  via a direct service call leaves no project row); a PM creating a project owned by someone else
  is 403; PATCH stale version is 409, `endDate < startDate` is 422, completing a project with open
  tasks is 422, and a stray `initialBudget` field on PATCH is rejected (400) by the strict schema;
  member add/duplicate/remove rules hold, including "cannot remove the owner" and "cannot remove a
  member with an open assigned task" (asserted against the seeded contributor who actually has one).
- **Human review:**: manually confirmed budget-headline fields populate correctly on a PM-managed (non-owned) project and PM list scope matches owned ∪ managed ∪ member.

### 08 Tasks & milestones — 2026-10-18

- **Goal:** Task and milestone CRUD with overdue/due-soon indicators, weighted project
  progress recomputed from SQL, and field-level authorization so a contributor can only
  change `progress`/`status` on their own assigned task.
- **Prompt/approach:** /run-feature 08 with the feature spec + CLAUDE.md + feature 07's
  context file.
- **First output issue:** Two real bugs, not just a wrong first attempt.
  (1) The list-query SQL built a `count(*) OVER()` column by string-appending it after a
  shared `SELECT ... FROM ... JOIN ...` template — which puts the new column _after_ the
  FROM clause, a syntax error that only shows up at query time (500s on every tasks list
  endpoint). Fixed by splitting the template into a column-list constant and a separate
  FROM constant, so a caller composes `SELECT <columns>, count(*) OVER() ... FROM ...`
  correctly.
  (2) A latent, pre-existing bug surfaced by this feature's own tests: `pg` returns
  Postgres `DATE` columns as JS `Date` objects, and `db/pool.ts` only overrides the BIGINT
  type parser, not DATE's. `JSON.stringify`/`res.json()` then renders a `Date` as a full,
  timezone-shifted ISO datetime (e.g. `2026-09-29T20:00:00.000Z` for a DB value of
  `2026-09-30`), not the `YYYY-MM-DD` CLAUDE.md requires. This has been true since feature
  07's `projects` module shipped, but nothing caught it because `projects.test.ts` only
  does inequality date comparisons (which still pass lexicographically even with a time
  suffix attached). Tests in this feature assert exact date-string equality (e.g. an
  achieved milestone's `achievedDate`) and immediately failed.
- **Refinement:** Fixed both at the root. The SQL template split is scoped to
  `tasks.repository.ts`. The DATE type-parser fix is a one-line addition to `db/pool.ts`
  (`pg.types.setTypeParser(1082, v => v)`), which is process-wide and therefore also fixes
  `projects`' `startDate`/`endDate` — documented in this feature's context file as a
  cross-cutting change, not scoped to tasks/milestones, so a future reader isn't confused
  about why a date-parsing fix shipped in a tasks-feature commit.
- **Verification:** `npm run typecheck && npm run lint && npm test` all pass (180 tests, up
  from 144; 36 new, 24 tasks + 12 milestones). Confirmed against the seeded data: the
  overdue filter returns PRJ-001's 6 overdue tasks and excludes the one due exactly on the
  cutoff (2026-09-30); the unassigned filter returns PRJ-003's single unassigned task; a
  contributor's progress update on their own task returns 200 with an incremented version
  and the project's `progressPct` (re-fetched via `GET /projects/:id`) reflects a
  hand-computed weighted average; the same contributor gets 403 with `details.fields`
  listing `dueDate`/`assigneeId` when they try to change those on their own task, and plain
  403 on another member's task; a non-member gets 404; a stale `version` is 409;
  `status: 'done'` with `progress: 60` normalises to 100 with `completedAt` set, and
  dropping progress back below 100 without an explicit status reverts to `in_progress` and
  clears `completedAt`; deleting a task is blocked unless it's untouched (`todo`/`progress
0`); milestone creation/update enforce due-date-within-project-dates and
  achieved-requires-achievedDate, both audited.
- **Human review:**
  - Accepted the DATE type-parser fix as the root cause: `pg` parsed DATE as local
    midnight, so on my machine (UTC+4) dates shifted a day. Grepped modules for date
    arithmetic on DB fields; [none found / fixed X].
  - Feature 07 missed this because its tests only used inequality checks. Date fields are
    now asserted with exact equality.
  - Checked the SQL template split: all filters are still bound parameters.
  - Verified in DBeaver that PRJ-001 has 6 overdue tasks and the task due on 2026-09-30
    is excluded.
  - Non-member access returns [404/403], consistent with feature 07.

### 09 Risks & issues — 2026-10-18

- **Goal:** Risk/issue register per project with exposure scoring, a cross-portfolio view,
  and a high-exposure drill-down, with the closed-high-exposure-risk-must-not-count-as-open
  edge case correct.
- **Prompt/approach:** /run-feature 09 with the feature spec + CLAUDE.md + feature 07's
  context file (for `scopedProjectIdsSql`, left unused since feature 05, and
  `findMemberRole`).
- **First output issue:** The feature file names the new migration `009_risk_band.sql`, but
  migrations 009–012 already exist (fixes/features from earlier in the project) by the time
  this feature ran — the feature files were apparently written before those were added.
  Not a bug to fix, just a stale literal filename in the spec; used `013_risk_band.sql`
  (forward-only numbering) and noted the discrepancy in this feature's context file so it
  isn't mistaken for a mistake later.
- **Refinement:** None needed beyond that — typecheck/lint passed on the first pass, and all
  19 new tests passed on the first full run. Deliberately chose to re-run the
  mitigation-required rule on _every_ PATCH (not just when probability/impact/mitigation
  change), computed from the patch merged onto the current row — documented in the context
  file since it means the seeded `FORCE_OPEN_HIGH_EXPOSURE` fixture (score 20, no mitigation,
  left that way on purpose by the generator) can't be PATCHed at all, including just closing
  it, until a mitigation is supplied in the same request.
- **Verification:** `npm run typecheck && npm run lint && npm test` all pass (199 tests, up
  from 180; 19 new). Confirmed against the seeded data: `/risks/high-exposure` includes
  PRJ-005's open score-20 risk and excludes PRJ-002's closed score-25 risk; a contributor's
  `/risks` and `/risks/high-exposure` are scoped to exactly their `project_members` rows; a
  non-member's project-nested `GET` is 404 and a member's `POST`/`PATCH` is 403;
  `probability: 6` is a 400 (schema), `probability*impact >= 15` with no `mitigation` is a
  422 on both create and update (including when probability/impact are raised into the high
  band by a patch); an ineligible (non-member) owner is 422; closing sets `closedAt` and
  reopening clears it; a stale `version` is 409; every create/update is audited.
- **Human review:** The mitigation rule (score ≥ 15) came from my feature spec, not the assignment. Claude Code applied it on every PATCH, which means the seeded unmitigated high risk can't be edited until a mitigation is added. Kept it as a governance rule.

### 10 Change requests & approval workflow — 2026-10-18
- **Goal:** Controlled approval workflow with explicit state machine, self-approval prevention,
  idempotent decisions and durable history — decision, history row and audit row commit
  atomically. Acceptance tests C and D.
- **Prompt/approach:** /run-feature 10 with feature spec + CLAUDE.md
- **First output issue:** Integration test for non-requester resubmit returned 404 instead of
  403 — `asProjectMember()` resolves a contributor from a different project than the returned
  CR's project (PRJ-006). The non-requester needs to be a member of the same project to get 403
  instead of 404. Fixed by querying for another member of the CR's own project.
- **Refinement:** Updated the test to dynamically find a project member of the returned CR's
  project (not the requester) to verify the 403 response correctly.
- **Verification:** `npm run typecheck && npm run lint && npm test` — 230 tests pass (16 new
  unit tests for the state machine, 15 new integration tests). Acceptance C (PM approves
  eligible CR: exactly one history row and one audit row added) and Acceptance D (contributor
  calls decision endpoint: 403, CR unchanged, no history row) both pass. Also verified that
  approving a CR leaves `fn_project_financials` values unchanged.
- **Human review:** TODO (owner)
