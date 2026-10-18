# PPFC Portal — Project Portfolio & Financial Control Portal

Internal PMO application: projects, tasks, milestones, risks, change-request approvals, project finance (budgets, costs, forecasts, EAC) and an executive analytics dashboard. **Every line must be explainable by the human owner**, so prefer clear, boring, well-commented code over clever code.

## Stack (do not change without asking)

| Layer                  | Choice                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Runtime                | Node.js 20 LTS, TypeScript (strict), ESM                                                                       |
| API                    | Express 4, zod (validation), pino + pino-http (logging)                                                        |
| DB                     | PostgreSQL 16 via `pg` (raw parameterized SQL, **no ORM**)                                                     |
| Auth                   | bcryptjs + jsonwebtoken, JWT in httpOnly cookie `ppfc_token` (Bearer header also accepted for API tools/tests) |
| Security               | helmet, cors (allowlist), express-rate-limit, cookie-parser                                                    |
| Tests                  | Vitest + supertest against a real Postgres test DB (`ppfc_test`)                                               |
| Data                   | @faker-js/faker with fixed seed 42, csv-stringify / csv-parse                                                  |
| Dev tooling            | tsx (run TS), ESLint + Prettier, Docker Compose (Postgres)                                                     |
| Frontend (later phase) | React + Vite + TypeScript                                                                                      |

## Repo layout

```
ppfc-portal/
├── CLAUDE.md
├── docker-compose.yml
├── docker/postgres/init.sql        # creates ppfc_test DB + ppfc_reader role
├── data/csv/                       # generated CSVs (committed)
├── docs/                           # api-routes, data-dictionary, architecture, security, ai-dev-log, e2e-checklist
├── backend/
│   ├── db/migrations/NNN_name.sql  # forward-only, numbered
│   ├── scripts/                    # migrate.ts, generate-data.ts, import-csv.ts
│   ├── src/
│   │   ├── app.ts                  # buildApp() — no listen(); used by tests
│   │   ├── server.ts               # listen()
│   │   ├── config/env.ts
│   │   ├── db/{pool,tx}.ts
│   │   ├── lib/                    # errors, logger, audit, pagination, money, dates
│   │   ├── middleware/             # requestId, authenticate, authorize, validate, idempotency, errorHandler
│   │   └── modules/<module>/       # <m>.routes.ts, .controller.ts, .service.ts, .repository.ts, .schemas.ts
│   └── tests/{helpers,unit,integration}/
├── frontend/   React SPA (Vite + TS). Talks only to /api/v1 of backend/.
└── .claude/{features,skills,context}/
```

## Commands (run from `backend/`)

```
docker compose up -d db            # (from repo root) Postgres on localhost:5433
npm run dev                        # tsx watch src/server.ts
npm run db:migrate                 # apply migrations to DATABASE_URL
npm run data:generate              # write data/csv/*.csv (deterministic)
npm run db:import                  # truncate + load CSVs into DB
npm run db:reset                   # migrate + import
npm run typecheck && npm run lint
npm test                           # vitest run (uses DATABASE_URL_TEST)
```

## Layering rules

- **routes** wire URL + middleware (authenticate, validate, idempotency) → **controller**.
- **controller**: parse validated input, call service, shape HTTP response. No SQL, no business rules.
- **service**: business rules, authorization checks on the loaded resource, transactions (`withTx`), audit writes.
- **repository**: the only place SQL lives. Parameterized (`$1`) only — never string-concatenate values. Accepts an optional `client` so it can run inside a transaction.
- One module per folder. No file over ~250 lines; split it.

## API conventions

- Base path `/api/v1`. JSON in camelCase; DB columns snake_case; map in the repository.
- List: `{ data: T[], meta: { page, pageSize, total } }`. `page` default 1, `pageSize` default 20, max 100. Single: `{ data: T }`.
- Errors (always): `{ error: { code, message, details?, requestId } }`.
- Status codes: 200 read/update, 201 create, 204 delete, 400 malformed, 401 unauthenticated, 403 role not allowed, 404 not found **or out of the caller's project scope** (don't leak existence), 409 version/state conflict, 422 business-rule violation, 429 rate limit.
- Error codes: `VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, VERSION_CONFLICT, INVALID_TRANSITION, SELF_APPROVAL_FORBIDDEN, BUSINESS_RULE, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL`.
- Optimistic locking: mutable entities have `version int`. Client sends `version`; `UPDATE ... WHERE id=$1 AND version=$2` → 0 rows = 409 `VERSION_CONFLICT`. Increment on every update.
- Idempotency: `Idempotency-Key` header on cost posting, CR decisions, budget-revision decisions. Same key + same user replays the stored response.
- Dates are `YYYY-MM-DD`. Money is `NUMERIC(14,2)` in DB; **sum and compute money in SQL**, never in JS loops; return as number rounded to 2 dp with `currency: "AED"`.
- Every response carries `x-request-id`.

## Roles & authorization (server-side, every route)

Global role on `users.role`: `contributor | project_manager | admin`.

- **canView(project)**: admin, OR project owner, OR row in `project_members`.
- **canManage(project)**: admin, OR (`role = project_manager` AND (owner OR `project_members.member_role = 'manager'`)).
- Contributor: view member projects; update **own assigned task's** `progress`/`status` only; submit change requests. **Never** approve, post costs, or edit finance.
- Project Manager: manage their projects (tasks, milestones, risks, costs, forecasts, budget-revision requests); decide CRs on their projects **except their own**.
- Admin: everything; role management; cost categories; budget-revision decisions (never own); audit review.
- Pattern: load resource → get its `project_id` → `assertProjectAccess(user, projectId, 'view' | 'manage')`. Out of scope → 404. In scope but role insufficient → 403.

## Financial definitions (apply exactly; implemented once in SQL)

- Current approved budget = initial approved budget + Σ **approved** budget revisions. Pending/rejected have no effect.
- Actual spend = Σ **posted** cost transactions with `txn_date <= asOf` (reversal entries subtract). Drafts excluded.
- Remaining = current budget − actual. Utilization = actual / NULLIF(current budget, 0) → `null` when budget is 0.
- Forecast-to-complete (FTC) = Σ forecasts for months **after** the asOf month.
- EAC = actual + FTC. Projected variance = current budget − EAC (negative = overrun).
- Project with no forecast rows: FTC = 0, EAC = actual, flag `forecastMissing: true`.
- Approved change requests never auto-create costs or budget revisions.
- Reporting date default `2026-09-30` (from `app_settings.reporting_date`; API accepts `?asOf=`).
- Posted costs are immutable: no update/delete; corrections via a `reversal` entry linked by `reverses_id`.

## Transactions & audit

Any mutation that must be atomic with its history uses `withTx`: e.g. CR decision + `change_history` row + `audit_events` row; cost posting + audit row. `writeAudit(client, { actorId, entityType, entityId, action, projectId, before, after, requestId })` is called with the **same client**. Never write audit outside the transaction.

## Testing rules

- Vitest + supertest; tests hit `buildApp()` and the real `ppfc_test` DB (reset via migrate + CSV import in global setup, `fileParallelism: false`).
- Each feature adds tests for: happy path, validation failure, authorization denial, and its key business rule.
- Use helpers in `tests/helpers/` (`loginAs(role|email)`, `api()`, `resetDb()`). Seeded demo users are documented in `docs/demo-accounts.md`.
- A feature is not done until `npm run typecheck && npm run lint && npm test` all pass.

## Git

- Conventional commits: `feat(finance): post cost with audit in one transaction`. One feature file = one or more focused commits. Never commit `.env`.

## Do not

- Add an ORM, a new framework, or a dependency not listed in a stack table (backend or frontend) without asking. Everything in the Frontend stack table below is pre-approved.
- Compute KPIs in the frontend or patch numbers client-side.
- Join tasks/risks/costs directly to projects in one aggregate query (fan-out inflation). Aggregate each fact in its own CTE, then join.
- Put secrets, real people, or real company names in code or data.
- Silently skip a failing test or weaken an assertion to make it pass.

## Frontend (frontend/)

### Frontend stack (pre-approved)

| Concern      | Choice                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Build        | Vite + React 18+ + TypeScript (strict)                                                                                                  |
| Routing      | react-router-dom (data routers not required; plain `<Routes>` is fine)                                                                  |
| Server state | @tanstack/react-query — the ONLY place API data is cached                                                                               |
| API client   | openapi-fetch + openapi-typescript (dev) — types generated from the backend OpenAPI file                                                |
| Forms        | react-hook-form + zod + @hookform/resolvers                                                                                             |
| UI           | shadcn/ui (Radix primitives, copied into `src/components/ui`), Tailwind CSS, lucide-react icons, sonner toasts                          |
| Tables       | @tanstack/react-table (server-side sort/filter/pagination)                                                                              |
| Charts       | recharts (risk matrix is a CSS grid, not a chart lib)                                                                                   |
| Dates        | date-fns                                                                                                                                |
| Font         | @fontsource-variable/inter (bundled, no CDN)                                                                                            |
| Tests        | vitest + @testing-library/react + @testing-library/user-event + @testing-library/jest-dom + jsdom + msw; @playwright/test for E2E smoke |
| Lint/format  | eslint (typescript-eslint, react-hooks) + prettier                                                                                      |

Use the current shadcn CLI init for Vite and follow its docs for the Tailwind version it sets up — do not hand-roll a different setup.

### Frontend structure

```
frontend/src/
  app/            App.tsx, router.tsx, providers.tsx (QueryClient, Toaster, Auth)
  api/            schema.ts (generated, never hand-edit), client.ts, errors.ts, queryKeys.ts
  auth/           AuthProvider, useAuth, RequireAuth, can.ts (UI-only permission hints)
  components/
    ui/           shadcn components (generated, light edits only)
    layout/       AppShell, Sidebar, Topbar, PageHeader
    data/         DataTable, FilterBar, Pagination, EmptyState, ErrorState, LoadingState
    form/         FormField wrappers, ConfirmDialog, SubmitButton
    display/      StatusBadge, PriorityBadge, ExposureBadge, Money, Percent, DateText, KpiCard
  features/<module>/   pages/, components/, hooks/ (useXQuery, useXMutation), schemas.ts
  lib/            format.ts (money, %, dates), cn.ts, idempotency.ts
  test/           setup.ts, msw handlers, render helpers
```

One feature folder per backend module: projects, tasks, milestones, risks, change-requests, finance, dashboard, admin, automation, notifications.

### Frontend rules

- **Backend is the source of truth.** Never compute KPIs, totals, utilization, EAC, progress or scores in the browser. Display what the API returns. After a mutation, **invalidate** the related queries so the UI refetches — never patch numbers in the cache.
- **Only call endpoints that exist** in the OpenAPI file or the backend context files. If a screen needs an endpoint that does not exist, stop and ask — do not invent it and do not add backend routes from a frontend feature.
- **Typed client:** `npm run api:types` regenerates `src/api/schema.ts` from the backend OpenAPI file. If a real response differs from the OpenAPI schema, fix the OpenAPI file (and note it in the AI dev log) rather than casting with `as any`.
- **Auth:** httpOnly cookie set by the backend. Every request uses `credentials: 'include'`. Vite dev server proxies `/api` → `http://localhost:4000`, so there is no CORS in dev. Session = `GET /auth/me`. A 401 anywhere → clear the query cache and redirect to `/login?next=...`.
- **Role-aware UI is convenience only.** Hide or disable actions the user can't take (`can.ts`), but always handle a 403 gracefully — the backend decides. Never treat hidden buttons as security.
- **Errors:** parse the backend shape `{ error: { code, message, details, requestId } }` in `api/errors.ts`. Show `message` to the user; show field `details` inline on forms; show `requestId` in small text on error states and toasts so a failure can be traced in the logs.
- **Concurrency:** PATCH bodies always send the `version` the form loaded. On 409 `VERSION_CONFLICT` show a dialog: "This record was changed by someone else" with a Reload action. Never auto-retry with a fresh version.
- **Double submit:** consequential POSTs (cost post, CR decision, revision decision, forecast save) send an `Idempotency-Key` generated once when the dialog/form opens (`lib/idempotency.ts`) and reused on retry. Submit buttons disable while pending.
- **Confirmation:** posting a cost, reversing a cost, approving/rejecting/returning a CR, approving a budget revision, changing a user's role → ConfirmDialog stating the consequence.
- **Dates:** API dates are `YYYY-MM-DD` strings. Never pass them through `new Date(str)` for display (timezone shift — see feature 08). Format with `lib/format.ts#formatDate`, which parses as a calendar date.
- **Money:** amounts arrive as strings. Format with `Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' })` in `<Money>`; percentages with `<Percent>`. No arithmetic on money in the frontend.
- **Lists:** filters, sort and page live in the **URL search params** (shareable, back button works). Debounce text search (300 ms). Server-side pagination only.
- **States:** every data view renders Loading (skeleton), Empty (message + primary action if allowed), Error (message + requestId + Retry). Successful saves show a toast.
- **Accessibility:** all actions keyboard-reachable, visible focus ring, labels on every input, `aria-live` for toasts, status never conveyed by colour alone (badge = colour + text, optionally icon), contrast ≥ 4.5:1 for text.
- **Tests:** test behaviour, not markup: form validation, permission-driven UI, 409/403 handling, query invalidation after mutation. Mock the network with msw, never mock React Query internals.

### Design system — clean, calm, executive

Goal: looks like a modern internal SaaS tool (Linear / Vercel dashboard calm), not a template. Restraint over decoration.

- **Palette (CSS variables via shadcn theme):**
  - Background `slate-50` page, `white` cards; borders `slate-200`; text `slate-900` / muted `slate-500`.
  - Primary accent **indigo-600** (buttons, active nav, links, focus ring). Use it sparingly.
  - Semantic: success `emerald-600`, warning `amber-500`, danger `rose-600`, info `sky-600`, neutral `slate-400`.
  - Badges use the soft variant: `bg-<color>-50 text-<color>-700 ring-1 ring-<color>-200`.
- **Fixed status mapping (use everywhere):**
  - Project: planning=neutral, active=info, on_hold=warning, completed=success, cancelled=neutral (strikethrough-free, muted).
  - Task: todo=neutral, in_progress=info, blocked=danger, done=success; overdue adds a danger "Overdue" badge; due-soon (≤14 days) adds a warning "Due soon".
  - Risk exposure: high (≥15)=danger, medium (8–14)=warning, low (≤7)=success.
  - CR: submitted=info, returned=warning, approved=success, rejected=danger.
  - Cost: draft=neutral, posted=success, reversed=neutral muted.
- **Chart palette (fixed series colours):** Budget `slate-400`, Actual `indigo-600`, EAC `amber-500`, Forecast `teal-500` (dashed line), Overrun highlight `rose-600`. Category series: indigo, teal, amber, sky, violet, slate in that order.
- **Typography:** Inter. Page title 24/600, section title 16/600, body 14/400, caption 12/500 muted. All numbers `tabular-nums`. KPI value 28/600.
- **Spacing & shape:** 4 px grid; page padding 24 px (16 px mobile); cards `rounded-xl border shadow-sm p-5`; gap 16–24 px between cards; table rows 44 px; max content width 1440 px.
- **Layout:** left sidebar (240 px, collapsible to icons; sheet drawer on < 1024 px) with grouped nav: Overview (Dashboard), Delivery (Projects, My tasks, Risks), Governance (Change requests), Finance (Alerts, Comparison), Admin (Users, Audit log, Automation). Topbar: page breadcrumb, "Data as of 30 Sep 2026" badge, notifications bell with unread count, user menu (name, role, logout).
- **Page header pattern:** title + one-line description on the left, primary action on the right, filter bar below.
- **Detail pages:** header card (code, name, status badge, owner, dates, progress bar) + tabs (Overview, Tasks, Milestones, Risks, Change requests, Finance, Activity).
- **Empty states:** small lucide icon in a muted circle, one sentence, one action.
- **Motion:** only subtle transitions (150–200 ms) on hover, dialogs and drawers. No decorative animation.
- **Responsive:** ≥ 1280 full layout; 768–1279 sidebar collapsed, 2-column KPI grid; < 768 single column, tables scroll horizontally inside their card, filter bar collapses into a "Filters" sheet.

### Frontend commands (package.json scripts)

`dev`, `build`, `preview`, `typecheck`, `lint`, `format`, `test`, `test:watch`, `test:e2e`, `api:types`.

Frontend gate: `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`.
