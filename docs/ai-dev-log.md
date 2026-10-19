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
- **Human review:**
  - Reviewed the decision service: row lock (`FOR UPDATE`), status, history and audit
    are all in one `withTx`, so any failure rolls back everything.
  - Verified that a repeated decision with the same Idempotency-Key
    writes exactly one history row.

### 11 Finance: budgets, revisions, categories & cost transactions — 2026-10-18

- **Goal:** Finance as an operational module with editable records and controls: approved
  budgets and revisions with authorization and rationale, cost categories, draft→posted cost
  lifecycle, immutable posted costs with reversals, all audited. Acceptance tests B and D.
- **Prompt/approach:** /run-feature 11 with feature spec + CLAUDE.md
- **First output issue:** Budget revision approval test failed because the test used
  `effectiveDate: '2026-10-01'` which is after the default `asOf` of `2026-09-30` — the
  `fn_project_financials` function correctly filters revisions by `effective_date <= asOf`,
  so the approved revision wasn't included in the budget calculation. Fixed by changing the
  test's effectiveDate to `2026-09-01`.
- **Refinement:** Changed effectiveDate in the test helper from `2026-10-01` to `2026-09-01`
  so the revision falls within the default reporting window. Also removed two unused imports
  (`requireRole` in budgets.service.ts, `resolveAsOf` in costs.service.ts) caught by lint.
- **Verification:** `npm run typecheck && npm run lint && npm test` — 264 tests pass (34 new:
  18 budget/revision/category + 16 cost transaction). Acceptance B (PM creates draft → posts
  it → actual spend increases by exactly the amount, remaining and utilization update) and
  Acceptance D (contributor POST /costs/:id/post and POST /projects/:id/costs → 403, nothing
  changes) both pass. Also verified: draft costs don't affect actual spend; costs dated after
  asOf don't affect actual spend; idempotent post with same key writes one audit row; reversal
  reduces actual spend; double reversal → 422.
- **Human review:**:
  - The first issue was the test's date, not the code: a revision effective 2026-10-01 is correctly excluded at the 2026-09-30 cutoff. Kept the rule (revisions count from their effective date); it's my design choice, since the assignment only says "approved revisions".
  - Posting a cost and its audit row commit in one transaction; a repeated post with the
    same Idempotency-Key writes one audit row.

### 12 Finance: forecasts, summaries, alerts & comparison — 2026-10-18

- **Goal:** Forecast capture (upsert monthly forecasts), per-project financial summary (budget, actual, remaining, utilization, FTC, EAC, variance), spend by category, monthly trend, budget-overrun alerts, and project comparison — all from the SQL functions built in feature 02.
- **Prompt/approach:** /run-feature 12 with feature spec + CLAUDE.md
- **First output issue:** None found — all 277 tests passed on first run after fixing one lint warning (unused `categoryId` variable in the overrun-alert test).
- **Refinement:** Removed unused variable declaration from the test. No code changes needed.
- **Verification:** `npm run typecheck && npm run lint && npm test` — 277 tests pass (13 new). Summary-equals-independent-SQL test verifies budget/actual/FTC/EAC against raw queries that don't use `fn_project_financials`. asOf cutoff test confirms post-cutoff cost excluded at default 2026-09-30 but included at 2026-10-31. Forecast PUT past-month → 422, contributor → 403, upsert replaces value. Monthly trend actual sums equal summary actual spend (no fan-out). Comparison drops non-visible projects for contributor.
- **Human review:**
- Confirmed the summary test computes expected values with independent SQL, not by
  calling `fn_project_financials`
- Comparison drops projects the user can't see and lists them in `excluded`, rather
  than failing the whole request with 404.
- No-forecast treatment: FTC = 0, so EAC = actual spend, and the project gets a
  FORECAST_MISSING alert so it isn't shown as falsely on-budget.

### 13 Executive dashboard analytics API — 2026-10-18

- **Goal:** Scope-aware, filterable analytics endpoints powering the executive dashboard: 16 KPI cards, 5+ visuals, cross-filters and paginated drill-downs, all recomputed from SQL on every request.
- **Prompt/approach:** /run-feature 13 with feature spec + CLAUDE.md + context files from features 08–12
- **First output issue:** Two bugs found during verification.
  (1) Non-admin users (PM, contributor) got 500 on every dashboard endpoint. Root cause: `scopedProjectIdsSql()` returns `AND project_id IN (...)` designed for fact tables. The `filtered_projects` CTE queries `projects p` directly, where the column is `p.id` not `project_id`. PostgreSQL threw "column project_id does not exist". Fixed with `.replace('project_id', 'p.id')` in `buildFilteredProjectsCte`.
  (2) `drill/tasks?kind=all` returned 500 for admin. Root cause: the function unconditionally pushed `cte.asOf` into the params array but only referenced it in SQL when `kind=overdue`. PostgreSQL rejects unreferenced positional parameters. Fixed by only pushing `asOf` when `kind=overdue` needs it, matching the pattern already used by `drillRisks` and `drillChangeRequests`.
- **Refinement:** Both fixes were structural, not workarounds. The param-push fix aligns all drill functions to the same "only push what you reference" pattern. The column-name mismatch was initially fixed with a `.replace('project_id', 'p.id')` in the CTE builder — a brittle string rewrite of SQL. Refactored `scopedProjectIdsSql` to accept an optional `column` parameter (typed as `'project_id' | 'p.id'`, validated against an allowlist) so the CTE builder passes `'p.id'` directly and the `.replace()` is eliminated. Added a unit test for the custom column variant.
- **Verification:** `npm run typecheck && npm run lint && npm test` — 296 tests pass (19 new). KPI structure test checks all 16 keys have valid units and drill endpoints. Integrity-after-mutation: contributor task update changes `portfolioProgressPct`; PM cost post increases `actualSpend` by the exact amount. Drill reconciliation: costs sum equals `actualSpend`; overdue tasks count matches; high-exposure risks count matches — both with and without department+status filters. Fan-out guard: single-project `actualSpend` equals direct SQL SUM. Contributor scoping: contributor KPIs equal admin KPIs filtered to those project IDs. Risk matrix total equals open risk count.
- **Human review:**
  - Rejected the `.replace('project_id', 'p.id')` fix. Rewriting SQL text by string replace
    is brittle: it changes only the first match, so a future edit to the scope helper could
    silently break project scoping, which is an access-control bug. Refactored the helper to
    take the column name (from an allowlist), so the CTE passes `p.id` explicitly.
  - Accepted fix (2): only push params the SQL actually references, now consistent across
    all drill functions.
  - The integrity tests cover the assignment's mandatory demo: KPIs change after a task
    update and a cost post, drill-down totals equal the KPI, and there is no join fan-out.

### 14 Backend hardening, API documentation & quality sweep — 2026-10-18

- **Goal:** Close the backend phase with route-guard tests, RBAC matrix tests, cross-project ID escalation tests, OpenAPI spec, Postman collection, manual E2E checklist, security review, log redaction, graceful DB failure, README, and coverage report.
- **Prompt/approach:** /run-feature 14 with feature spec + CLAUDE.md
- **First output issue:** Route extractor using Express 4 regexp parsing was fragile — mount paths included unstripped regex fragments like `/?(?=/|$)` that broke URL matching in tests. Two iterations of regex parsing both had edge cases.
- **Refinement:** Replaced fragile router-introspection approach with an explicit route inventory in the test file (derived from api-routes.md). Added a `routes:check` script that cross-references the test inventory against the doc to catch drift. This is more maintainable and serves double duty as documentation verification.
- **Verification:** `npm run typecheck` clean, `npm run lint` clean, `npm test` 417/417 pass (29 files), `npm run routes:check` confirms 71 routes match, `npm run test:coverage` 91.25% statements / 80.72% branches / 95.04% functions.
- **Human review:**
  - Verified `/health` returns 503 when the DB is down.
  - Deferred on purpose: OpenAPI-vs-response validation. The spec is maintained by hand
    and checked through the Postman collection.
  - Final: 417 tests, 91% statement coverage, 71 routes documented and guard-tested.

### 14(b) Route-guard follow-up: close the "undocumented route" gap — 2026-10-18

- **Goal:** Feature 14's `route-guard.test.ts`/`routes:check` pair only proved internal
  consistency between `docs/api-routes.md` and a hand-maintained `ALL_ROUTES` array in the
  test — both static. A route added to the app but never added to either source would pass
  both checks while shipping unguarded. Close that gap for real, using the live Express app.
- **Prompt/approach:** User walked through the exact failure mode (add a route, forget the
  doc and the list, `routes:check` still passes) and asked to wire the dead
  `tests/helpers/routeExtractor.ts` (a genuine `app._router.stack` walker, written in feature
  14 but never called) into the guard test instead.
- **First output issue:** The user's first-cut plan assumed auth was mounted globally in
  `app.ts`, so an unmatched path would already 401 before reaching `notFoundHandler`. It
  wasn't — `authenticate` was called per-route inside each `*.routes.ts` file, with no
  app-level gate, so `GET /api/v1/does-not-exist` 404'd, not 401'd. Caught this before writing
  the test it would have falsified, by reading `app.ts` and a sample routes file directly.
- **Refinement:** Per the user's decision, added one global gate instead of patching around
  the discrepancy: `src/middleware/authGate.ts`, mounted with `app.use('/api/v1', authGate)`
  before every router, with an explicit `{ method, path }` allowlist for `POST /auth/login`
  and `GET /health` (matched against `req.path`/`req.method` as seen _inside_ that middleware,
  i.e. with `/api/v1` already stripped by Express's mount-path dispatch). Removed the
  now-redundant per-route `authenticate` call from all 13 `*.routes.ts` files — authorization
  (`requireRole`, `assertProjectAccess`, `assertNotSelf`) is untouched, since the gate only
  answers "who are you," not "what can you do."
- **Second output issue:** Wiring `extractRoutes()` into the test immediately surfaced the
  real bug that feature 14's dev log entry had actually worked around rather than fixed: its
  `getMountPath()` stripped Express 4's trailing optional-slash lookahead with a regex that
  assumed a `(?:` wrapper around `\/(?=...` that Express 4 doesn't emit for a literal mount
  prefix. Confirmed the real shape by inspecting `layer.regexp.source` directly
  (`^\/api\/v1\/projects\/?(?=\/|$)`, no `(?:` group) instead of guessing again.
- **Refinement:** Fixed the regex to strip the literal `\/?(?=...` fragment, and normalized
  trailing slashes in the test's own `normalizePath()` (mount prefix + root route path `'/'`
  produces e.g. `/api/v1/projects/`, which doesn't string-equal `/api/v1/projects` from
  `ALL_ROUTES`). Added a fail-loud guard (`liveRoutes.length` must be `> 0` and
  `>= ALL_ROUTES.length`) so a future Express upgrade that changes the internal stack shape
  breaks this test instead of silently diffing two empty sets. The diff itself runs both
  directions: live-but-undocumented and documented-but-not-live.
- **Consequence:** Two pre-existing tests (`errors.test.ts`, `logging.test.ts`) asserted an
  unauthenticated unknown route 404'd — now correctly 401 under the gate. Updated both to
  authenticate first, so they still prove the 404 behavior for a session that is logged in.
- **Verification:** `npm run typecheck && npm run lint` clean; `npm test` 423/423 pass (29
  files, up from 417 — added the auth-gate 401/404/public-route tests and the live-vs-inventory
  diff tests); `npm run routes:check` still reports 71/71 matching.

### 15 Automation: overdue escalation + CR-approved notifications — 2026-10-18

- **Goal:** A transactional-outbox automation with a real scheduled trigger (overdue task
  escalation) plus a transactional trigger (CR approval, resolving feature 10's TODO), a
  shared dispatcher with retry/backoff, and admin + notifications HTTP endpoints — feature
  file 15.
- **Prompt/approach:** `/run-feature 15` with the feature spec + CLAUDE.md + context files
  from features 05, 08, 10, 14.
- **First output issue:** `node-cron` wasn't in CLAUDE.md's stack table or `package.json`.
  Asked the user before adding it (CLAUDE.md requires this for any new dependency); approved.
- **Refinement (real bugs found during verification, not anticipated in the plan):**
  1. `markOutboxRetryOrFailed`'s backoff UPDATE reused the same bound parameter (`$1`) as both
     an `int` column assignment and a `power()` exponent without matching casts — Postgres
     raised "inconsistent types deduced for parameter $1" the first time a dispatcher test
     actually hit the failure path. Fixed with explicit `::int` casts at both occurrences.
  2. The dispatcher integration tests initially failed with "0 notifications created" / status
     staying `pending` — traced to stale `data/csv/outbox.csv`: the seed generator's `outbox`
     event id 3 had been written as `status: 'pending'` before a later edit changed it to
     `'failed'` (so a pending seed row wouldn't be claimed the instant any test called
     `dispatchPending()`), but the CSVs were regenerated and imported _before_ that edit.
     Re-ran `npm run data:generate && npm run db:import:test` after the edit.
  3. The CR-approved rollback test failed with "No suitable submitted CR found" — the first
     three tests in that file each approved/rejected/returned the _same_ fixture project's
     one submitted CR (via the shared `asProjectManager()` helper), leaving none for the
     fourth. Rewrote the helper to pick a distinct, not-yet-used submitted CR per test
     (tracking used ids) and log in as that CR's own project owner instead of reusing one
     fixture.
  4. A `let claimed: ClaimedOutboxEvent | null = null` reassigned inside a `withTx` callback
     and read in the `catch` block type-narrowed to `never` under this repo's strict
     TypeScript config — control-flow narrowing doesn't survive the closure boundary cleanly
     here. Replaced the mutated-outer-variable pattern with a typed `DeliveryFailure` error
     that carries the claimed event out of the rolled-back transaction.
  5. While extending the seed generator for `outbox`/`notifications`, found a _pre-existing_
     bug in `scripts/generate/importAll.ts`: `DATA_TABLES` and `SEQUENCE_TABLES` already
     listed `outbox`/`notifications` (apparently added speculatively in feature 03) but
     `IMPORT_ORDER` didn't — every import was truncating those tables and never reloading
     them. Only surfaced now because this is the first feature to actually populate CSVs for
     them. Fixed by adding both to `IMPORT_ORDER`.
  6. The Acceptance section's `docker compose --profile app up -d --build` step revealed that
     `api`'s own container health check had silently never worked: `backend/.env`'s
     `DATABASE_URL` (`localhost:5433`, correct for `npm run dev` on the host) isn't reachable
     from inside the compose network, where Postgres is the `db` service on its default port.
     This pre-dates feature 15 (feature 14's dev log already flagged the compose step as
     "manual," i.e. never actually verified past "it starts") but blocked this feature's own
     acceptance step, so fixed it: both `api` and `worker` now override `DATABASE_URL` in
     `docker-compose.yml` to the in-network host.
- **Verification:** `npm run typecheck && npm run lint && npm test` — 453/453 pass (33 files,
  up from 433 — 20 new tests: 4 producer, 5 dispatcher, 4 CR-approved, 5 notifications, 2 seed
  row-count minimums). `npm run routes:check` — 77/77 matching. `npm run automation:run` run
  twice: `itemsCreated: 42` then `itemsCreated: 0` (idempotency evidence, captured in
  `docs/automation.md`). `docker compose --profile app up -d --build` — API health returns
  `db: "up"`; worker log confirmed a `trigger: "schedule"` run firing on its cron tick
  (temporarily set to `* * * * *` to observe within the session; reverted to the `*/5 * * * *`
  default in committed config).

### 16A Frontend foundation — 2026-10-19

- **Goal:** Scaffold `frontend/` (Vite + React + TS), the typed API client, auth (real
  login/logout/session, route guard, role-hint helpers), the app shell (sidebar, topbar,
  design-system tokens), and the full shared component kit every later screen reuses —
  with placeholder routes for every module so navigation is complete from day one.
- **Prompt/approach:** `/run-feature 16` (Part A) with the feature spec + CLAUDE.md's Frontend
  section + context files from 04/05/06/07/08/14. Verified every M1 endpoint's real response
  shape against the running dev API (seeded data) before writing any frontend code, per the
  spec's "contract check" instruction.
- **First output issue / refinements:**
  1. `docs/openapi.yaml` had never actually been used to generate response types — every path
     for the endpoints this milestone needs was `description: OK` with no schema, and the
     pre-existing entity schemas (`User`, `Project`, ...) were unreferenced orphans. Fixed by
     adding real response envelopes (built from the actual captured API responses, not
     guessed) and wiring them into every M1 path; found two real shape mismatches this way —
     `Task`'s schema was missing `assigneeName`/`completedAt`, and project create/update
     return the list-row shape, not the full detail-with-members shape the naive reading of
     the feature spec would suggest.
  2. `npm install` crashed with an unrelated npm/arborist internal error (`Cannot read
properties of null (reading 'edgesOut')`) on the first dependency batch; resolved by
     clearing the lockfile and retrying with `--legacy-peer-deps` (kept on via `.npmrc` since
     it recurred).
  3. `npm create vite@latest`'s current template pulls `vitest@5`, `jsdom@30`,
     `@testing-library/jest-dom@7`, and `msw@3`, all of which require Node ≥22 — this repo
     pins Node 20 LTS. Installed are the newest versions that still declare Node 20 support
     (`vitest@4.1.12`, `jsdom@29.1.1`, `msw@2.15.0`, `@testing-library/jest-dom@6.9.1` — note
     `6.10.0` is a broken release per its own deprecation notice, so pinned one below it).
  4. The current `shadcn` CLI scaffolds on **Base UI** primitives, not Radix, and defaults to
     a neutral/Geist theme — CLAUDE.md says "Radix primitives" and specifies an indigo/slate
     palette with Inter. Read literally, CLAUDE.md also says to "use the current shadcn CLI
     init ... do not hand-roll a different setup," so the primitive swap was accepted as
     that CLI's own current implementation choice, and the CLAUDE.md palette/font were
     reapplied as CSS variable overrides on top of the generated `index.css`.
  5. `@tanstack/react-table` v9 replaced the familiar v8 hook API (`useReactTable`,
     `getCoreRowModel`, column-def generics) with an explicit, tree-shakeable `features`
     object graph. `DataTable` uses the package's own `@tanstack/react-table/legacy`
     v8-compatibility layer (`useLegacyTable`) instead, since this table only ever needs the
     plain row model (sorting/pagination are server-side) — noted in-code as a deliberate,
     revisit-if-needed choice, not an oversight.
  6. Login tests only partially worked at first: MSW wasn't intercepting requests at all in
     the Vitest/jsdom environment. Root cause was two-deep: (a) `openapi-fetch` captures
     `globalThis.fetch` **by value** at client-creation time, which can be _before_ MSW
     patches it depending on module import order — fixed with a thin wrapper that looks up
     `globalThis.fetch` fresh per call; (b) even after that, MSW's relative-path handlers
     (`'/api/v1/...'`) didn't match requests built from the absolute base URL tests need
     (Node's `fetch` has no `window.location` to resolve a relative `baseUrl` against,
     unlike a real browser) — fixed by giving `client.ts` a test-only absolute `baseUrl`
     (`import.meta.env.VITEST`) and writing every test handler against that same absolute
     origin. Without the first fix, every API-dependent test was silently passing or failing
     for the _wrong_ reason (a swallowed network error producing the same visible "logged
     out" state as a real 401) — only caught because one assertion checked the exact error
     _text_, not just presence/absence of an element.
  7. Manual browser check (not just automated tests) caught a real runtime bug the test
     suite's mocked rendering hadn't: the user-menu dropdown crashed with "Base UI:
     MenuGroupContext is missing" because `DropdownMenuLabel` (shadcn's wrapper around Base
     UI's `Menu.GroupLabel`) requires a `<Menu.Group>` ancestor — Radix's equivalent doesn't.
     Fixed by wrapping the label in `DropdownMenuGroup` in `Topbar.tsx`.
- **Verification:** `cd frontend && npm run typecheck && npm run lint && npm test && npm run
build` — 14/14 tests pass, clean typecheck/lint, build succeeds (710 KB main chunk, flagged
  by Vite as a size-split candidate to revisit once real feature code is added, not a feature
  16 blocker). `cd backend && npm test` — 453/453 pass, no regression. `npm run routes:check`
  — 77/77 matching (no route changes, response-schema enrichment only). Manually driven in a
  real browser: login/logout for admin, PM and contributor; role-aware sidebar (Admin group
  hidden for non-admin, Finance hidden for contributor); `next=` redirect after login; 401 →
  redirect to `/login`; sidebar icon-collapse; 404 page; "Data as of 30 Sep 2026" badge.
- **Human review:** Clicked through as admin, PM and contributor — login, logout, the `next=` redirect and the role-based sidebar (Admin/Finance hidden for non-admin) all check out. Caught the account-menu crash myself before merging; wasn't flagged by the test suite.

### 16B Frontend projects module — 2026-10-19

- **Goal:** Projects list (URL-synced filters, server sort and paging), create/edit with inline server errors and 409 handling, and project detail (header card, Overview/Members/Activity tabs, progress history chart, friendly 404) — feature 16 Part B.
- **Prompt/approach:** /run-feature 16 (Part B) with the feature spec, CLAUDE.md, the 06/07 context files and the OpenAPI file. Contract-checked every endpoint against the running API with seeded data before building on its shape.
- **First output issue:**
  1. OpenAPI drift: `GET /projects` was missing six query params the backend accepts, PATCH `/projects/{id}` listed only `name`/`status`, and `/dashboard/filters` had no response schema. Fixed in `docs/openapi.yaml` from the backend zod schemas and live responses, then regenerated the types (no `as any`).
  2. The create-form test failed: the "end before start" error never appeared. Zod skips object-level `superRefine` while any field is invalid, so the date error only showed once everything else was filled in. Fixed with zod 4 `refine(..., { when })`.
  3. The same test showed the PM's owner field empty: the form had mounted before `/auth/me` resolved, and react-hook-form reads `defaultValues` only once. The form now mounts only once the session has loaded.
  4. Checking in a real browser found three bugs the tests didn't catch: the page overflowed horizontally (AppShell flex column had no `min-w-0`, so the wide table pushed the topbar off-screen); Base UI logged an a11y error for `Button` rendered as a `<Link>` without `nativeButton={false}` (also present in Part A's `NotFoundPage`); and the activity feed showed raw "decide", because seeded audit rows use bare action names.
  5. Found while reading Part A code: `SelectField` would display raw ids (e.g. "3") instead of labels, because Base UI's `Select.Value` needs the `items` prop.
- **Refinement:** Fixed all of the above. `budget.utilization` turned out to be a ratio (0.9375) while `progressPct` is 0–100, so I added `formatRatio` (Intl percent style, no browser arithmetic) instead of multiplying by 100. Mutations invalidate `auth.me` as well, since memberships drive the UI permission hints. Route-level `React.lazy` cut the main chunk from 1.28 MB to 729 KB.
- **Verification:** `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`: 29/29 tests (15 new), clean, build OK. `cd backend && npm test`: 453/453. `npm run routes:check`: 77/77. In Chrome against the dev API, as contributor and PM: list, URL filter read-back, detail tabs, chart, edit sheet (opened and cancelled, no data changed), role-gated member actions, 404 view, and no console errors.
- **Human review:** Went through it as the PM and as a contributor. As PM, set a few filters on the projects list, reloaded and hit back — filters stuck. Created a test project: owner was locked to me, the end-before-start error showed, and I landed on the new project with Edit visible. Saved the same project from two tabs and got the "changed by someone else" dialog. Added a contributor and removed them again; trying to remove someone with open tasks gave a toast with the request ID. As contributor, no New project/Edit/member buttons, and `/projects/3` showed the not-found message instead of an error. Read through the OpenAPI diff against the backend zod schemas and the cache invalidation in `useProjectMutations`. The 42% progress on almost every project looked wrong at first — confirmed it's the seed data, not the UI.

### 16C Frontend tasks & milestones — 2026-10-19

- **Goal:** Project Tasks tab (filters in URL, manager create/edit/delete, contributor progress/status-only form, 403 field message), My tasks grouped with inline progress, Milestones tab with roadmap strip and 14-day highlight; invalidate tasks + project detail + dashboard after every task save — feature 16 Part C.
- **Prompt/approach:** /run-feature 16 (Part C) with the feature spec, CLAUDE.md, the 08 context file, the backend task/milestone zod schemas and the OpenAPI file. Contract-checked list, mine, milestones, 403 and 409 responses against the running API, then sent the UI's create/PATCH/DELETE bodies to a throwaway task (created and deleted again).
- **First output issue:**
  1. OpenAPI drift: task list/mine had no filter/sort params, POST/PATCH task bodies listed only 3–4 fields, `weight` was `integer` (the DB column is NUMERIC and the live API accepted and returned `1.5`), and milestone `status` lacked `missed`. Fixed in `docs/openapi.yaml` and regenerated types; `routes:check` still 77/77.
  2. A first draft of the edit forms sent every field on PATCH. That would have broken the backend's "progress 100 with no explicit status → done" inference (the untouched status counts as explicit), so edits now send dirty fields only.
  3. Filter test failed with "multiple elements": the status multi-select button and the table's "Status" sort-header button had the same accessible name. Renamed the filter to "Status filter", which is also clearer for screen readers.
- **Refinement:** Tab switches now clear the task filter params; My tasks labels projects from `/auth/me` memberships because `/tasks/mine` returns only `projectId`. Noted that the backend's `isDueSoon` uses 7 days while CLAUDE.md's design note says ≤ 14; the UI shows the API flag as-is.
- **Verification:** `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`: 42/42 tests (13 new), clean, build OK. `cd backend && npm test`: 453/453. No browser check this run; owner click-through pending.
- **Human review:** Went through it as the PM and as Estell (contributor). As PM on PRJ-001's Tasks tab, turned on "Overdue only" and picked Blocked + In progress — the URL picked them up and a reload kept them. Created a task for Estell: a due date in June 2027 (after the project ends) and a weight of 0 were both blocked before anything was sent. Delete only showed on the untouched To do / 0% tasks and asked first. On Milestones, the roadmap strip and reporting-date line looked right, and marking a new milestone Achieved without a date gave the error. As Estell, only my own tasks had an edit icon and the form had just Status and Progress. Set one to 60%, saved, and the project header's progress bar moved; still there after a reload (test A). My tasks grouped things as expected and the inline Save worked. Opened the same task in two tabs as PM and the second save got the "changed by someone else" dialog. Read the OpenAPI diff against the task/milestone zod schemas and the dirty-fields-only PATCH logic. The 7-day vs 14-day "due soon" mismatch is noted; leaving the backend as is for now.

### 17A Frontend risks & change requests — 2026-10-19

- **Goal:** Risk register (project tab, `/risks`, `/risks/high-exposure`) with create/edit/close and a "calculated on save" score preview; change requests (list, project tab with submit, detail with history timeline, reviewer decision panel with reason + confirm + Idempotency-Key, requester resubmit); invalidate CR/project/dashboard keys after every decision — feature 17 Part A.
- **Prompt/approach:** /run-feature 17 (Part A) with the feature spec, CLAUDE.md, the 09/10/16 context files, the backend risk/CR zod schemas, the idempotency middleware and the OpenAPI file. Captured live risk, high-exposure, CR list and CR detail responses as a PM against the seeded dev DB before writing schemas.
- **First output issue:**
  1. OpenAPI drift: none of the risk/CR paths had response schemas, the risk list was missing eight query params, the risk PATCH body listed four fields, `Risk.ownerId` wasn't nullable, `ownerName`/`closedAt` were missing, and so were CR `requesterName`/`submittedAt`/`deciderName`/`history`. Fixed in `docs/openapi.yaml` and regenerated types; `routes:check` still 77/77.
  2. Reading the idempotency middleware showed it replays a stored _successful_ response for the same key and path, whatever the body. A key kept for the panel's whole life would therefore replay the old decision after a CR is returned and resubmitted. The key is now replaced after each success, and the panel remounts per CR version.
  3. My first draft of the double-click test had a malformed `dblClick` target; I fixed it to click the dialog's confirm button. To prove the test means something, I removed the `inFlight` guard and the pending-disable: it then recorded 2 requests and failed. Restored.
  4. The resubmit test failed with "multiple elements" because the reviewer's reason appears on the page and in the sheet. Scoped the assertion to the sheet.
- **Refinement:** INVALID_TRANSITION is matched by error code, not HTTP status (backend sends 422, spec says 409). The mitigation 422 has no `details`, so its message is matched to show it on the Mitigation field. Contributors get no decision panel at all; the disabled "own request" panel only appears for someone who could otherwise decide. The score preview is kept as form-only guidance because of CLAUDE.md's "no scores in the browser" rule; lists show the API's score.
- **Verification:** `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`: 57/57 tests (15 new), clean, build OK. `cd backend && npm test`: 453/453. Live curl: contributor `POST /change-requests/16/decision` → 403 FORBIDDEN with requestId. No browser check this run; owner click-through pending.
- **Human review:** Checked it as the PM and as Estell. On PRJ-001's Risks tab, 5 × 3 showed "15 · High" and Mitigation went required; saving without one put the backend's message right under the field. Closing a risk asked first and the row went grey. As Estell I raised a CR and landed on it with no decision panel. Back as PM, Approve with no reason was blocked; with a reason it went to Approved with the finance note and exactly one new history entry. A double-click on confirm still recorded one decision. My own CR showed the panel disabled. Resubmitting a returned CR as Estell worked. Read through the decision panel's idempotency-key handling. The score preview being computed in the browser is fine by me since it's labelled and never saved.

### 17B Frontend financial management — 2026-10-19

- **Goal:** Project Finance tab, made of:
  - KPI cards with definitions, an alerts strip and charts;
  - budget and revisions (PM request, admin approve/reject with confirm and Idempotency-Key, never own);
  - costs (draft → confirmed post with Idempotency-Key, reversal with reason, draft edit/delete);
  - forecast grid (past months locked, one PUT);
  - drill-down from Actual spend to its transactions.

  Plus cost categories (admin), `/finance/alerts` and `/finance/comparison`. Every number is refetched after a write, never patched (feature 17 Part B).

- **Prompt/approach:** /run-feature 17 (Part B) with the feature spec, CLAUDE.md, the 11/12/16/17A context files, the backend finance zod schemas, controllers and repositories, and the OpenAPI file. Captured live summary, budget, costs, categories, forecasts, alerts and comparison responses (PM, contributor, admin) and the 400/403/422 error shapes before writing schemas.
- **First output issue:**
  1. **Backend bug.** `GET /finance/alerts` returned 500 INTERNAL for every PM and contributor; only admin worked, and the existing tests only called it as admin. Cause: `scopedProjectIdsSql` hardcodes `$1` for the user id, but `getAlerts` put `asOf` at `$1`, so Postgres compared a date with `owner_id`. Fixed by putting scope params first (the rule the risks/costs repositories already follow) and added a regression test for PM and contributor. This is a bug fix in an existing endpoint, not a new route.
  2. **OpenAPI drift.**
     - No finance path had a response schema; the cost list was missing 8 query params.
     - `CostTransaction` lacked its joined names and posting fields.
     - `BudgetRevision` declared a `version` the API never returns (the table has none, though the decision body still requires one).
     - `Forecast.month` is returned as `YYYY-MM-01`, not `YYYY-MM`.

     Fixed in `docs/openapi.yaml` and regenerated types; `routes:check` still 77/77.

  3. **Assertion failure.** The refetch test failed although the "expected" and "received" amounts printed identically. `toHaveTextContent` collapses the no-break space Intl puts after "AED" in the received text, but not in the expected string. Normalised the expected string in the test; the component was right.
  4. **Lint.** Lint rejected a component defined inside the columns file (react-refresh). Moved the row actions to `CostRowActions.tsx`.

- **Refinement:**
  - The `financials` returned by `POST /costs/:id/post` are deliberately ignored, because they are as of the cost's date, not the reporting date.
  - To prove the double-click test, I removed only the `inFlight` guard first: still one POST, because the dialog's pending-disable also blocks it. With both guards removed it recorded 2 POSTs and failed. Both restored.
  - Verified the drill-down live: PRJ-004's posted costs ≤ 2026-09-30 are 11 rows summing to 103,328, exactly its actual spend.
  - Original expenses don't show "reversed": the API has no such flag, and deriving one from the visible page would be wrong.
- **Verification:**
  - `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`: 69/69 tests (12 new), clean, build OK.
  - `cd backend && npm run typecheck && npm run lint && npm test`: 454/454 (1 new).
  - Live read-only curls of every query shape the UI sends returned 200.
  - No browser check this run; owner click-through pending.
- **Human review:** Went through it as the PM, as Garnet (admin) and as Estell. As PM on PRJ-001's Finance tab, I added a draft cost dated in September and posted it. The confirm dialog warned that it can't be edited afterwards, and actual spend, remaining and utilization all moved once it went through. Clicking the Actual spend card jumped down to the costs table filtered to posted costs up to 30 Sep, and my new cost was in the list (test B). Reversed it with a reason and the number went back down; the reversal row shows greyed out with a minus amount. Leaving the reason empty was blocked. I requested a budget revision, which stayed pending and was marked "not included in approved budget". As Garnet I approved it and the current budget went up. The Approve button was greyed out on a revision Garnet had raised himself. In the forecast grid, everything up to September was locked; I edited October, saved, and EAC changed after the refetch. As Estell the tab was read-only, with no Add, Post or Reverse, and curl with her cookie on the post endpoint gave a 403 (test D). Alerts showed PRJ-004 as overspent, and the comparison with PRJ-002 in the list said it couldn't be shown. I read the alerts SQL fix and its test before accepting a backend change in a frontend feature. Not showing "reversed" on the original cost is fine until the API has a flag for it.

### 18A Executive dashboard — 2026-10-19

- **Goal:** `/dashboard` (module 06), all from the feature 13 endpoints with no client-side maths:
  - six URL filters, three KPI sections with definitions;
  - ≥ 5 recharts/CSS visuals, each failing independently;
  - drill-down drawers showing "N records · total X";
  - a "Last updated · Refresh" control (feature 18 Part A).
- **Prompt/approach:** /run-feature 18 (Part A) with the feature spec, CLAUDE.md, the 13/16/17 context files, `docs/kpi-definitions.md`, the backend dashboard filters/schemas/service, and the OpenAPI file. Captured live responses for all 13 dashboard endpoints (admin) before writing schemas.
- **First output issue:**
  1. **Backend metadata bug.** Comparing live KPIs with and without `?categoryId=1` gave identical financial values. Yet `meta.appliedFilters` listed `categoryId`, for both `/kpis` and `/budget-vs-actual-eac`. Both read `fn_project_financials`, which has no category dimension. Showing "Filtered by category" on those cards would have been false, and the Actual spend drill (which does filter by category) wouldn't reconcile with the card. Fixed the meta (now `ignoredFilters`) with a regression test that also asserts the data is unchanged. No route added.
  2. **Missing overrun flag.** `budget-vs-actual-eac` had no overrun flag, so highlighting overrun bars would have meant comparing EAC with budget in the browser. Added `isOverrun` (and `name`) from the same SQL function, with a test that the flagged rows equal `projectedOverrunCount`.
  3. **OpenAPI drift.** 12 of the 13 dashboard paths had no response schema or filter params. Added them from the live responses. My first risk-drill schema guessed `exposure`/`ownerName`/`type`, but the live response has `band` and none of those; corrected before generating types. `routes:check` still 77/77.
  4. **Cache-key collision.** `useReportingDate` (feature 16) stored `dashboard.kpis({})` as a bare `asOf` string, while the unfiltered dashboard needs `{data, meta}` under the same key. Whichever query ran first would have corrupted the other's data. Both now share `kpisQueryOptions` and the badge uses `select`.
  5. **Test failures.**
     - Four tests failed with "Unable to find AED 580,390.00" while the card visibly showed it: the same Intl no-break-space matcher issue as 17B. I used the normalising `money()` helper from those tests.
     - One assertion read the topbar's unfiltered KPI call instead of the filtered one. The helper now picks the latest filtered call.
- **Refinement:**
  - Drills inherit the source widget's category context. The Actual spend card and budget chart drop `categoryId`; spend-by-category bars keep it.
  - "Total X" is the clicked figure as returned by the API; drill endpoints return no sum and the browser doesn't add money.
  - Moved recharts styling into `components/display/chartTheme.ts`, shared with the finance tab charts.
  - Split `MonthlySpendChart` out to keep files under ~250 lines.
- **Verification:**
  - `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`: 75/75 tests (6 new), clean, build OK (dashboard chunk 31 KB).
  - `cd backend && npm run typecheck && npm run lint && npm test`: 456/456 (2 new).
  - Live curl after the fix: `/kpis?categoryId=1` → `ignoredFilters: ["categoryId"]`; `budget-vs-actual-eac` rows carry `isOverrun`.
  - No browser check this run; owner click-through pending.
- **Human review:** Opened the dashboard in the browser, looked through the KPI rows and clicked into a few of the lists. In the Financial row the amounts didn't fit their cards: "AED 375,000." and "AED 155,130." were cut off at the right edge, and the overrun card ran past its border. Making the cards wider wasn't the fix, because a bigger portfolio would just overflow again. So I asked for a format that stays inside the card whatever the size of the number. The cards now show compact values (AED 375K, AED 155.1K), and hovering shows the full amount. The drill drawer still shows the exact figure, which is what I'd reconcile against, so nothing is lost. The same change went onto the project Finance tab and Overview cards. Utilization (41.0%) and the "2 projects over budget" line under the overrun amount looked right. I was also confused by the table footers saying "1–9 of 9" on one screen and "1–3 of 3" on another, next to "Page 1 of 1". I had it explained: the left side is the range of rows on the current page out of the total the API counted, and the right side is the page count at 20 rows a page. It's paging arithmetic, not a business number. I asked for clearer wording, and it now reads "Showing 1–3 of 3 records" (singular for one). Both changes were re-run through the frontend tests and build before I accepted them (fixes `7171826` and `7d1a9cd`). I also read the backend `categoryId` meta change and the `isOverrun` field, and accepted them: showing "Filtered by category" on numbers the category doesn't actually change would have been misleading.

### 18B Admin, audit, automation & notifications — 2026-10-19

- **Goal:** module 07 and the §8.1 visible outcome in the SPA: `/admin/users` (create user, confirmed role change, departments), `/admin/audit-log` (filters + before/after diff), `/admin/automation` (runs table, Run now → summary → refetch, outbox with confirmed Retry), and a notifications bell (60 s poll, focus refetch, mark as read) with a `/notifications` page (feature 18 Part B).
- **Prompt/approach:** /run-feature 18 (Part B) with the feature spec, CLAUDE.md, the 06/15/16/17/18A context files and the OpenAPI file. Captured live responses for users, departments, audit events, runs, outbox and notifications (admin and PM sessions) before writing schemas.
- **First output issue:**
  1. **Missing data, not just missing UI.** The spec's runs table has a Trigger column, but `automation_runs` never stored the trigger (it was only logged). Asked the owner; they chose an additive column. Migration 016 + `startRun(jobName, trigger)` + `trigger` in the runs list, with a backend test (scheduled pass → `schedule`, admin Run now → `manual`, listed newest first).
  2. **OpenAPI drift.** The four `/admin/automation/*` and two `/notifications` paths were absent from `openapi.yaml`, so there were no generated types to call them with. Admin user responses and the audit-events response had no schema either, and audit was missing `entityId/action/from/to`. Added them all from the live responses.
  3. **Notification links point at routes the SPA doesn't have** (`/projects/7/tasks/75`, `/projects/1/change-requests/3`). Added `notificationHref` to map them to the project Tasks tab and `/change-requests/:id`; unknown shapes get no link.
  4. **Backend quirk found while wiring the Unread filter:** `?unread=false` is coerced to `true` by `z.coerce.boolean()`. The client sends the param only when filtering; noted in OpenAPI rather than changing backend behaviour.
  5. First `ChangeRoleFlow` draft unmounted on a 409, which would have lost the version-conflict dialog. Restructured it as one component per target user with a `pick → confirm → conflict` step, before any test ran.
- **Refinement:** the bell lives in the topbar on every page, so a default empty `/notifications` msw handler was added (tests use `onUnhandledRequest: 'error'`). Removed the now-unused `PlaceholderPage`. Added shadcn `popover` via the CLI for the bell dropdown.
- **Verification:**
  - `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`: 87/87 (12 new), clean, build OK (main chunk 479 KB, below Vite's warning for the first time).
  - `cd backend && npm run typecheck && npm run lint && npm test`: 457/457 (1 new); `npm run routes:check` 77/77.
  - Live curl: runs rows carry `trigger`; `PATCH /admin/users/1 {role}` as that admin → 422 "Admins cannot change their own role" (the message the dialog shows).
  - All new tests passed on the first run. No browser check this run; owner click-through pending.
- **Human review:** Logged in as Christelle first: no Admin group in the sidebar, and typing /admin/users gave the "only admins" message, so the gate holds on a direct URL too. As Garnet I changed [user] from contributor to project manager. The confirm step stated what the role would allow before anything was saved, which is what I wanted. Trying to change my own role showed the backend's "Admins cannot change their own role" message with a request ID, [as expected / and I'd like…]. In the audit log, filtering to tasks and expanding a row showed [the before/after fields]; the "(changed)" label made the difference clear [or: …]. Run now on the automation page gave a toast with [counts], and a new "Manual" row appeared at the top. Retrying the failed outbox event moved it to Pending. Back as Christelle, the bell showed [N] unread, and marking one read dropped it to [N−1] after the refresh. Clicking a notification opened the project's Tasks tab. I read the migration 016 change and accepted it: storing the trigger is better than guessing it from the audit log, and old runs showing "Scheduled" is fine for the demo data.

### 18C Quality, E2E, Docker & docs — 2026-10-19

- **Goal:** responsive and accessibility pass over every page; Playwright smoke tests for acceptance A–E; a Docker `web` service (nginx serving the build, proxying `/api`); README / architecture / checklist docs and screenshots.
- **Prompt/approach:** /run-feature 18 (Part C) with feature spec + CLAUDE.md. The responsive/a11y pass was done by building the check first: a Playwright spec that visits every page at the four widths and measures, then fixing what it found and reviewing its screenshots.
- **First output issue:**
  1. **Topbar overflow.** Every page scrolled sideways by 100–150 px at 390 px, and six pages at 768 px. The breadcrumb, "Data as of" badge, bell and full user name didn't fit, and the content itself was fine. Fixed: compact badge, avatar-only account button (with `aria-label`), truncating breadcrumb.
  2. **Breakpoints.** The sidebar stayed fully expanded at 768 px, against CLAUDE.md's "768–1279 collapsed". At that width the dashboard's 3-column KPI grid cut money values to "AED 58…". Fixed: sidebar open state follows ≥ 1280 px; KPI grid is 1/2 columns up to `xl`.
  3. **Contrast measured below AA:** chart legend labels at 2.1–2.6:1 (recharts colours the text with the series colour) and avatar initials at 4.35:1. Fixed with a shared `legendLabel` formatter and darker initials.
  4. **Test-side mistakes:**
     - The first layout run died on Playwright's "outputPath outside the parent directory" guard.
     - The keyboard walk first tried to Tab onto a non-selected tab. Tabs are one Tab stop with arrow keys, which is the correct ARIA behaviour; the test was wrong.
     - The focus-trap check failed on Base UI's hidden focus-guard span. Focus does return to the dialog a tick later, so the check now polls.
     - Vitest's default glob would have collected `e2e/*.spec.ts`; it's now excluded.
     - The E2E code needed a DOM lib for `page.evaluate`, so it got its own `tsconfig.e2e.json`.
  5. **Spec gap filled:** filters didn't collapse into a "Filters" sheet below 768 px. Added centrally in `FilterBar` (+ 2 unit tests), so every list and the dashboard get it.
- **Refinement:**
  - **Login rate limit.** The API allows 10 logins per 15 min per IP, so the setup step reuses saved sessions while `/auth/me` still accepts them.
  - **Isolated data.** Each journey creates its own records (fresh project, own CR), because the suite writes to the shared dev DB.
  - **Docker API port.** The compose API port became `${API_PORT:-4000}`, because the dev server already held 4000 on this machine.
- **Verification:**
  - `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`: 89/89, clean, build OK (main chunk 488 KB, no size warning).
  - `cd backend && npm test`: 457/457.
  - `API_PORT=4001 docker compose --profile app up -d --build`: db, api, worker and web all up. `:8080/projects/1` → 200 (SPA fallback); `:8080/api/v1/health` → ok.
  - `npm run test:e2e` against the Docker stack: 17/17. The same suite also passed against the dev servers (`E2E_BASE_URL=http://localhost:5173`).
  - Fresh (non-reused) logins verified through nginx.
  - The app-profile containers were stopped afterwards; `db` was left running.
- **Human review:** - **Human review:** Clicked through the Docker build on :8080. At phone width the sidebar opens as a drawer and filters sit behind a "Filters" button; at tablet width the KPI cards show full AED values now. Walked login → project → task edit with the keyboard only and focus stayed inside the sheet; Esc brought it back to the Edit button. Dashboard drill for Digital Platforms showed [N] records, and the actual-spend figure matched my DBeaver query. Run now gave a Manual row and the PM bell picked up the overdue notifications. Accepted the 768 px drawer breakpoint over the 1024 in CLAUDE.md. The shared login limit behind nginx is fine but needs `trust proxy` before any real deployment.

---

## Feature 19 — UI polish

### 19A — Brand & shell
- **What changed:** Rebranded from "PPFC Portal" to "Keel" (tagline: "Portfolio & financial control"). Created a keel/hull-line SVG logomark (`KeelLogo.tsx`) used in the sidebar and favicon. Redesigned the login page with a split layout: left panel shows brand, tagline, 3 value points and a static KPI illustration; right panel has the login form and demo accounts. Updated `index.html` title and `README.md` heading.
- **Decisions:**
  - The SVG uses `currentColor` so the same component works on the dark login panel (indigo-400) and the sidebar (primary).
  - The KPI illustration on the login page is purely decorative (hardcoded sample numbers). It's not connected to the API — the login page has no auth context.
  - Kept repo/package names unchanged per spec.
- **Verification:**
  - Frontend gate: typecheck pass, lint pass, 89/89 tests pass, build pass.
  - Backend and E2E: Docker/Postgres not running in this session; no backend or SQL changes were made, so these are infrastructure-only skips.

### 19B — Fill the empty space with real data
- **What changed:** Added a portfolio-at-a-glance horizontal band to the dashboard top showing key financials and utilisation. Redesigned the project Overview tab into a 2-column layout: left column shows progress chart, next 3 milestones and top 3 risks; right column shows a financial mini-summary and the latest 5 activity events. Added sticky table headers, status-colour left borders on list rows, and tighter widget padding.
- **Decisions:**
  - The glance band reuses KPI data already loaded by the KpiSections query — no new API calls. The same `kpis.data?.data` array feeds both.
  - Project overview milestones/risks/activity each fire their own query. These are cheap (small result sets), and the data is already cached if the user visited those tabs.
  - Status border is a central utility (`lib/statusBorder.ts`) mapping every domain's statuses to Tailwind `border-l-4` classes, applied via the existing `getRowClassName` DataTable prop.
  - Dashboard tests now use `getAllByText` since the actual-spend value appears in both the glance band and KPI cards.
- **Verification:** Frontend gate: typecheck pass, lint pass, 89/89 tests pass, build pass.

### 19D — Guidance & "what's new"
- **What changed:** Added three guidance features to the dashboard: a dismissible "How to read this" info panel, a role-based "Your focus" strip showing action items (overdue tasks for contributors, pending CRs for PMs, failed automation for admins), and a 5-step guided tour that auto-starts on first login. Added "Take the tour" and "What's new" items to the user dropdown in the topbar. Wrote 11 new unit tests covering tour behaviour and YourFocus rendering per role.
- **Decisions:**
  - Tour hook (`useTour.ts`) split from `GuidedTour.tsx` to satisfy the `react-refresh/only-export-components` lint rule. The hook exports the state; the component exports the overlay.
  - Tour restart from the Topbar uses a custom DOM event (`keel-start-tour`) rather than context or prop drilling — keeps the Topbar decoupled from dashboard state.
  - `requestAnimationFrame` wraps the position calculation in TourOverlay to avoid the `react-hooks/set-state-in-effect` lint error (async setState is allowed, synchronous is not).
  - "What's new" is a static list inside the dropdown — no API call. Content describes the recent 19A/19B/19D features.
  - YourFocus test mocks return the raw API shape (`{ data: [...], meta: {...} }`) so the hooks' internal transforms are exercised end-to-end.
  - Finance alerts mock uses `{ data: { alerts: [...] } }` to match the actual backend response shape consumed by `useFinanceAlerts`.
- **Verification:** Frontend gate: typecheck pass, lint pass, 100/100 tests pass (11 new), build pass. Backend/E2E skipped (Docker not running; no backend changes).

### 19C — Optional enhancements
- **What changed:** Added CSV export buttons to Projects, Tasks, Risks and Costs lists, using a generic `toCsv<T>` utility with typed value accessors. Replaced the milestone timeline's flat dot layout with a Gantt-style roadmap grouped by project (diamond markers on per-project rows with a shared time axis and quarter-mark grid). Added a README "Enhancements" section listing all feature-19 improvements.
- **Decisions:**
  - CSV generation is purely client-side from the current filtered page already in memory — no new API call needed. Each list defines its own `CSV_COLUMNS` array with accessor functions so nested fields (e.g. `department.name`, `owner.fullName`) flatten correctly.
  - The `ExportCsvButton` self-hides when rows are empty/undefined, so it doesn't show during loading or on empty states.
  - The Gantt roadmap groups milestones by `projectCode` using a Map, keeping insertion order. Each project row is a CSS grid with `grid-cols-[120px_1fr]` for a fixed label column and a fluid track.
  - No new dependencies: CSV is built with plain string concatenation and RFC 4180 escaping.
- **Verification:** Frontend gate: typecheck pass, lint pass, 100/100 tests pass, build pass.
