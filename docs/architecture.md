# Architecture

## Layers

```
HTTP request
   │
   ▼
routes          (URL + middleware wiring: authenticate, validate, idempotency)
   │
   ▼
controller      (parse validated input, call service, shape HTTP response — no SQL, no business rules)
   │
   ▼
service         (business rules, authorization checks on loaded resources, transactions, audit writes)
   │
   ▼
repository      (the only place SQL lives — parameterized, accepts an optional client for transactions)
   │
   ▼
PostgreSQL
```

Cross-cutting pieces that every layer can reach: `config/env.ts` (validated env), `lib/logger.ts`
(pino), `lib/errors.ts` (`AppError` + helpers), `middleware/errorHandler.ts` (maps any thrown
error to the standard `{ error: { code, message, details?, requestId } }` body), `db/pool.ts`
(single `pg.Pool`) and `db/tx.ts` (`withTx` for atomic mutation + audit).

`db/pool.ts` also registers two `pg` type-parser overrides, process-wide, so every query
through the pool (and any ad-hoc `pg.Client` a script or test opens — the override is global
to the `pg` module, not per-connection) gets JS-friendly values instead of `pg`'s defaults:
BIGINT (OID 20) as a real `number` (ids never approach `MAX_SAFE_INTEGER`) and DATE (OID 1082)
as the raw `YYYY-MM-DD` string Postgres already sends, instead of a `Date` object that
`JSON.stringify` would otherwise render as a full, timezone-shifted ISO datetime.

See `CLAUDE.md` for the full repo layout, API conventions, roles/authorization model and
financial definitions. This file stays a short map of *why* the layers are shaped this way;
details live in each feature's context file under `.claude/context/`.

## Entity-relationship summary

```
departments 1——N users
departments 1——N projects
users       1——N projects (owner)
projects    1——N project_members (→ users, role: manager|contributor)
projects    1——N tasks (→ users via assignee)
projects    1——N milestones
projects    1——N risks (→ users via owner)
projects    1——1 project_budgets
projects    1——N budget_revisions
projects    1——N cost_transactions (→ cost_categories)
projects    1——N financial_forecasts
projects    1——N change_requests (→ users via requested_by, decided_by)
projects    1——N progress_snapshots
change_requests 1——N change_history
users       1——N notifications
```

## Fan-out risk and CTE-first aggregation

When a project has N tasks, M costs, and K forecast rows, a naive `SELECT` that joins
all three to the project produces N × M × K rows — every combination is materialized,
inflating sums by the cardinality of the other dimensions. This is the "fan-out" problem.

The solution: **aggregate each fact in its own CTE first**, then `LEFT JOIN` the
single-row-per-project CTEs together. `fn_project_financials(as_of)` implements this
pattern: a `budget` CTE (initial + approved revisions), an `actuals` CTE (posted costs),
and an `ftc` CTE (future forecasts), each grouped by `project_id` before they touch
each other. The final `SELECT` joins these three one-row CTEs to `projects`, so every
project gets exactly one output row with correct totals.

## Optimistic locking and the concurrency scenario

Every mutable entity (`projects`, `tasks`, `milestones`, …) carries a `version int`.
A client must send back the `version` it last read; `lib/versioning.ts#updateWithVersion`
runs `UPDATE ... WHERE id = $1 AND version = $2` — 0 rows affected means someone else
updated the row first, which `updateWithVersion` turns into a 409 `VERSION_CONFLICT`
carrying `details.currentVersion` (re-read in the same statement's follow-up query).

Concrete walkthrough (feature 08, tasks): two browser tabs, A and B, both load the same
task at `version: 3`.

1. A edits `progress` and saves with `version: 3` → the `UPDATE ... WHERE version = 3`
   matches one row, the trigger-free `version = version + 1` bumps it to `4`, A's
   response shows `version: 4`.
2. B (still holding the stale `version: 3` from its original load) edits `status` and
   saves with `version: 3` → `UPDATE ... WHERE version = 3` now matches **zero** rows
   (the row is already at `4`), so the API returns `409 VERSION_CONFLICT` with
   `{ details: { currentVersion: 4 } }` instead of silently overwriting A's change.

The frontend's response to that 409 is to discard B's in-memory edit and show "This task
was changed by someone else — reload", rather than retrying the write (retrying would
need to re-apply B's intended change against the new row, which is a merge decision for
the user, not something the client can safely automate).

## Frontend (`frontend/`)

A React + Vite + TypeScript single-page app. It talks only to `/api/v1`, and the backend is the
source of truth for every number it shows.

```
browser ──► /            nginx (Docker) or Vite dev server
        └─► /api/v1/...  proxied to the API on the same origin → httpOnly cookie just works
```

### Routing

`app/router.tsx` uses plain `<Routes>`. `/login` is public; everything else sits under
`RequireAuth` + `AppShell` (sidebar, topbar, `<main>`). Feature pages are `React.lazy` chunks
behind one `Suspense` in the shell, so the dashboard, finance and admin code only loads when
someone opens those pages. Tabs, filters, sort and page all live in URL search params
(`useUrlFilters`), so every view is shareable and the back button works.

### API client and types

`api/schema.ts` is generated from `docs/openapi.yaml` (`npm run api:types`, never edited by
hand). `api/client.ts` is the one `openapi-fetch` client:
- every request sends `credentials: 'include'`;
- a middleware turns any 401 into "clear the query cache and go to `/login?next=…`".

When a real response disagreed with the OpenAPI file, the YAML was fixed rather than the type
being cast away (each case is noted in the feature context files and the AI dev log).

### State

- **Server state is cached only in TanStack Query.** Keys come from one factory
  (`api/queryKeys.ts`), one namespace per module.
- **Mutations invalidate; they never patch the cache.** Each module has a `useInvalidate…`
  hook that also invalidates `dashboard.all` (and `projects.all` where relevant), so KPIs
  refetch after any change instead of being recalculated in the browser.
- **The session** comes from `GET /auth/me` (`AuthProvider`). `auth/can.ts` turns role and
  memberships into UI hints only: hidden or disabled buttons. The API's 403/404 is the real
  rule, and every page handles it.
- **Local component state** covers only drafts: open dialogs, form values and the
  Idempotency-Key for the dialog that's open.

### Reusable components

| Folder | What lives there |
|---|---|
| `components/ui` | shadcn-generated primitives (Base UI), light edits only |
| `components/layout` | `AppShell`, `Sidebar` (nav config in `nav.ts`), `Topbar` (reporting-date badge, notification bell, account menu), `PageHeader` |
| `components/data` | `DataTable` (server-side sort/pagination), `FilterBar` (+ mobile "Filters" sheet), `FilterSelect`, `FilterMultiSelect`, `Pagination`, `Loading/Empty/Error/ForbiddenState` |
| `components/form` | RHF field wrappers (`TextField`, `SelectField`, …), `ConfirmDialog`, `ReasonConfirmDialog`, `VersionConflictDialog`, `SubmitButton` |
| `components/display` | `StatusBadge` (the one status → tone map), `Money`, `Percent`, `DateText`, `KpiCard`, `ProgressBar`, `chartTheme` (fixed series colours, legend style) |

Feature folders (`features/<module>/`) hold that module's pages, components and query/mutation
hooks.

### Errors, conflicts and double submits

- **Error parsing.** `api/errors.ts` turns every error body into an `ApiError` (`code`,
  `message`, `details`, `requestId`).
- **Where errors show:**
  - forms put 400 field details inline (`applyServerErrors`);
  - other failures become a toast or an `ErrorState` showing the request id, so a failure can
    be traced in the API logs.
- **409 `VERSION_CONFLICT`** opens "This record was changed by someone else" with a Reload
  action. There is never an automatic retry with a fresh version.
- **Consequential POSTs** (cost post, CR and budget-revision decisions, forecast save) carry an
  `Idempotency-Key`. It is created when the dialog opens and reused on retry; an in-flight
  guard and disabled submit buttons stop double clicks.
- **Dashboard widgets fail independently.** Each widget owns its own query and error state, so
  one failing endpoint never blanks the page.

### Design system and responsive layout

- **Look:** tokens in `index.css` (slate surfaces, indigo-600 accent, soft semantic badges),
  Inter, and `tabular-nums` for figures.
- **Status is never colour-only:** every badge carries text.
- **Breakpoints:**
  - ≥ 1280 px: full sidebar;
  - 768–1279 px: icon rail and a 2-column KPI grid;
  - < 768 px: sidebar as a drawer, filters in a "Filters" bottom sheet, single column.

  Wide tables scroll inside their card, never the page.
- **Enforced by `e2e/quality/layout.spec.ts`:** at all four widths it checks there's no page
  scroll, every control has an accessible name, and text meets WCAG AA contrast.

### What each test layer proves

| Layer | Proves |
|---|---|
| Backend Vitest + supertest (`backend/tests`) | Business rules, SQL figures, authorization, transactions/audit, against a real Postgres |
| Frontend Vitest + RTL + msw (`frontend/src/**/*.test.tsx`) | Component behaviour: validation, permission-driven UI, 403/409 handling, query invalidation after mutations, URL filters |
| Playwright (`frontend/e2e`) | The pieces work together in a real browser against the real API and DB: login cookie, the journeys A–E, keyboard operability, responsive layout |
