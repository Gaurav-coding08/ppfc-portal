# 16 — Frontend Milestone 1: foundation, projects, tasks & milestones

## Part A (done 2026-10-19)

### What exists now

A runnable React + Vite SPA (`frontend/`) with real authentication against the backend,
a typed API client generated from `docs/openapi.yaml`, the full app shell (sidebar, topbar,
design-system tokens), and the complete shared component kit (`components/data`,
`components/form`, `components/display`) every later screen will reuse. Every module has a
placeholder route so the nav is complete; Projects/Tasks/Milestones themselves are Part B/C.

### Files

- `frontend/` — new Vite + React 19 + TypeScript app (see root `README.md` "Running the
  frontend" for commands; `frontend/README.md` for the command list)
- `frontend/src/api/` — `schema.ts` (generated, never hand-edit — `npm run api:types`),
  `client.ts` (openapi-fetch client + 401 global-redirect middleware + fetch-lookup wrapper
  for tests), `errors.ts` (`ApiError`, `toApiError`, `isForbidden`/`isVersionConflict`/
  `isValidation`/`isNotFound`), `queryKeys.ts`
- `frontend/src/app/` — `queryClient.ts` (singleton), `providers.tsx`, `router.tsx`
  (plain `<Routes>`), `NotFoundPage.tsx`
- `frontend/src/auth/` — `AuthProvider.tsx` (session via `/auth/me`, `login`, `logout`),
  `useAuth.ts`, `authContext.ts` (split out so Fast Refresh doesn't choke on a file mixing a
  component and a hook export), `RequireAuth.tsx`, `can.ts` (UI-only role hints),
  `LoginPage.tsx`, `types.ts`
- `frontend/src/components/layout/` — `AppShell.tsx`, `Sidebar.tsx` (shadcn Sidebar +
  `nav.ts` config, role-filtered groups), `Topbar.tsx` (breadcrumb, "Data as of" badge, user
  menu), `PageHeader.tsx`, `PlaceholderPage.tsx`, `useReportingDate.ts`
- `frontend/src/components/data/` — `DataTable.tsx`, `FilterBar.tsx` (+ `SearchInput`),
  `Pagination.tsx`, `LoadingState.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `ForbiddenState.tsx`
- `frontend/src/components/form/` — `Field.tsx`, `TextField.tsx`, `NumberField.tsx`,
  `DateField.tsx`, `TextareaField.tsx`, `SelectField.tsx`, `SubmitButton.tsx`,
  `ConfirmDialog.tsx`, `VersionConflictDialog.tsx`
- `frontend/src/components/display/` — `ToneBadge.tsx` (base soft-badge), `StatusBadge.tsx`
  (per-entity status→tone maps), `PriorityBadge.tsx`, `ExposureBadge.tsx`, `Money.tsx`,
  `Percent.tsx`, `DateText.tsx`, `ProgressBar.tsx`, `KpiCard.tsx`
- `frontend/src/components/ui/` — shadcn-generated primitives (Base UI, not Radix — see
  Decisions). Light edits only.
- `frontend/src/lib/` — `format.ts` (`formatDate`/`formatDateTime`/`formatMoney`/
  `formatPercent`), `cn.ts`, `idempotency.ts` (`newIdempotencyKey`), `useUrlFilters.ts`,
  `useDebouncedValue.ts`
- `frontend/src/test/` — `setup.ts` (msw lifecycle + `matchMedia` stub), `handlers.ts`
  (default msw handlers + `API` absolute-origin constant), `server.ts`, `render.tsx`
  (`renderWithProviders`)
- `docs/openapi.yaml` — added real response-envelope schemas and wired them into every M1
  path's responses (see Decisions)

### Database

None.

### Endpoints / Pages

| Route | Guard | Notes |
|---|---|---|
| `/login` | public | Real login; `next=` redirect; demo-account list |
| `/` → `/dashboard`, `/projects`, `/my-tasks`, `/risks`, `/change-requests`, `/finance/alerts`, `/finance/comparison`, `/admin/users`, `/admin/audit-log`, `/admin/automation` | `RequireAuth` + `AppShell` | All `PlaceholderPage` until their part/milestone builds them |
| `*` (authenticated) | `RequireAuth` + `AppShell` | 404 page |

No backend endpoints added. `GET /dashboard/kpis` (built in feature 13, UI arrives M3) is
called once by `useReportingDate` purely for `meta.asOf`, per the feature spec's explicit
fallback instruction.

### Reusable pieces (use these, don't rebuild)

- `api` (`api/client.ts`) — the one openapi-fetch client; always goes through `credentials:
  'include'` and the 401-redirect middleware
- `toApiError(error, response)` / `ApiError` / `is*` guards (`api/errors.ts`) — parse every
  error response through this, never read `error.error.code` by hand
- `queryKeys.*` (`api/queryKeys.ts`) — one factory per module; add a new module's keys here,
  don't invent ad hoc key arrays in a feature
- `useAuth()` → `{ user, memberships, isLoading, login, logout }` and `can.ts`'s
  `canManageProject`/`canViewProject`/`canEditOwnTaskOnly`/`canCreateProject`/`isAdmin` etc.
  — the only place role/membership logic should live client-side
- `DataTable<TData extends RowData>` (`components/data/DataTable.tsx`) — server-side sort via
  `sort`/`order`/`onSortChange` props, column visibility built in, `onRowClick`. Pass
  `LegacyColumnDef<TData, unknown>[]` columns (from `@tanstack/react-table/legacy`), not the
  v9 `ColumnDef` from the main package
- `useUrlFilters(defaults)` (`lib/useUrlFilters.ts`) — list filters/sort/page in the URL;
  `defaults` must be a stable (module-level or memoized) object
- `FilterBar` + `SearchInput` (`components/data/FilterBar.tsx`) — debounced search wired to
  `useUrlFilters`
- `TextField`/`NumberField`/`DateField`/`TextareaField` (register-based) and `SelectField`
  (Controller-based, value/onChange) in `components/form/` — the FormField wrappers every
  create/edit form should use with react-hook-form + zod
- `ConfirmDialog` / `VersionConflictDialog` (`components/form/`) — standard consequence
  confirmation and 409-conflict dialogs
- `StatusBadge({domain, status})` (`components/display/StatusBadge.tsx`) — domains:
  `project`/`task`/`milestone`/`risk`/`changeRequest`/`cost`/`delivery`; add a new domain map
  here rather than hand-rolling tone logic in a feature
- `Money`/`Percent`/`DateText`/`ProgressBar`/`KpiCard` — never format money/dates/percent by
  hand in a feature component
- `formatDate`/`formatMoney`/`formatPercent` (`lib/format.ts`) — `formatDate` is the
  timezone-safe YYYY-MM-DD parser; never pass a bare date string through `new Date(...)`
- `newIdempotencyKey()` (`lib/idempotency.ts`) + `idempotencyHeaders(key)` (`api/client.ts`)
  — generate once per dialog-open, reuse on retry
- `renderWithProviders(ui, { route })` (`test/render.tsx`) — fresh QueryClient + MemoryRouter
  + AuthProvider per test
- `API` constant (`test/handlers.ts`) — the absolute test origin; every new msw handler must
  use `${API}/...`, not a bare relative path (see Decisions)

### Decisions & trade-offs

- **Base UI, not Radix**: the current `shadcn` CLI generates on `@base-ui/react` primitives
  and a neutral/Geist default theme. CLAUDE.md says "Radix primitives" but also says to use
  the current CLI's own setup rather than hand-rolling — read as the CLI's current
  implementation detail, not a stack decision to fight. The indigo/slate palette and Inter
  font were reapplied as CSS variable overrides in `index.css` after `shadcn init` ran.
  Generated `components/ui/*` files use Base UI's `render`/`useRender` composition pattern
  (e.g. `<Button render={<Link to="..." />} />`) instead of Radix's `asChild`.
- **`@tanstack/react-table/legacy`, not the native v9 API**: v9 replaced the familiar
  `useReactTable`/`getCoreRowModel` hook with an explicit `features` object graph. Since
  `DataTable` only ever needs the plain row model (sort/pagination are server-side, not
  computed by the table), it uses the package's own v8-compatibility `useLegacyTable` instead
  of hand-building a `features` graph. Marked deprecated upstream but still maintained;
  revisit only if a future feature needs v9-only functionality (grouping, pinning, etc.).
  Column defs must import `LegacyColumnDef`/`getCoreRowModel` from
  `@tanstack/react-table/legacy`, and `flexRender`/`RowData` from the main package.
- **`openapi.yaml` response schemas were enriched for every M1 endpoint**, built from real
  responses captured against the seeded dev DB (not guessed), because they were previously
  unused orphans (every path just said `description: OK`, no `content`). Out-of-scope modules
  (risks, change-requests, finance, admin/users mutation, dashboard beyond `kpis.meta`) were
  left as-is for their own feature/milestone to enrich.
- **Test-only absolute API origin**: `client.ts` uses `/api/v1` in the real app (relative,
  resolved via the Vite dev proxy against `window.location`) but `http://localhost/api/v1`
  under `import.meta.env.VITEST`. Node's `fetch` (what Vitest/jsdom actually use) has no
  browser-style relative-URL resolution, and msw's relative-path handlers didn't reliably
  match requests built from that absolute base in this environment either — so every test
  handler in `test/handlers.ts` is also written against the same absolute `API` constant.
  A new test file overriding `/auth/me` or any other endpoint must do the same
  (`http.get(\`${API}/...\`, ...)`), not a bare relative path.
- **`client.ts` wraps `fetch` as `(...args) => globalThis.fetch(...args)`** instead of letting
  openapi-fetch default to `globalThis.fetch` captured by value at client-creation time. The
  default would silently pin the client to whatever `fetch` existed at module-import time —
  possibly before msw's `server.listen()` patches it — bypassing every mock with no error.
  Harmless indirection in production.
- **`--legacy-peer-deps`** is set via `frontend/.npmrc` after a plain `npm install` crashed
  with an unrelated npm/arborist bug on this machine. Not a sign of a real peer-dependency
  conflict in this dependency set; revisit if it starts masking a real one.
- **Node 20 pins on test tooling**: `vitest@4.1.12`/`jsdom@29.1.1`/`msw@2.15.0`/
  `@testing-library/jest-dom@6.9.1` instead of each package's own "latest" tag, because the
  newest majors of each now require Node ≥22 and this repo is pinned to Node 20 LTS
  (CLAUDE.md). `@testing-library/jest-dom@6.10.0` specifically is skipped — it's a broken
  release per its own npm deprecation notice.
- **shadcn's "form" registry item is empty** under the current CLI/style (no files, just a
  bare manifest) — the FormField wrappers in `components/form/` are hand-built against
  react-hook-form directly instead of a generated `components/ui/form.tsx`.
- **Finance nav group hidden for contributors**: CLAUDE.md says contributors "never approve,
  post costs, or edit finance" but doesn't explicitly say view — read as hide-by-default since
  finance screens show portfolio-wide figures with no stated contributor use case; revisit if
  a later feature's spec says otherwise.
- **`useReportingDate` calls `GET /dashboard/kpis`** (feature 13, already built) purely for
  `meta.asOf`, per the feature spec's explicit fallback instruction — this does not build any
  dashboard UI; the KPI data itself is discarded.

### Known gaps / TODO for later parts/features

- Part B (Projects) and Part C (Tasks & milestones) still have placeholder pages.
- `npm run build`'s single JS chunk is 710 KB (223 KB gzip) — Vite's size-split warning.
  Acceptable at foundation stage (no real feature code yet); revisit with route-level
  `React.lazy()` once feature pages exist, not a Part A blocker.
- Notification bell has no real unread-count wiring (M3's notifications module).
- No Playwright E2E yet (M3), no Docker frontend step (M3).
- `can.ts`'s role hints cover project-level view/manage and the contributor-own-task case
  only; extend per-module as M2/M3 features need finer-grained hints (e.g. CR self-approval,
  budget-revision decision).

### How to verify quickly

```bash
cd backend && npm run dev            # :4000
cd frontend && npm install && npm run dev   # :5173, proxies /api

cd frontend
npm run typecheck && npm run lint && npm test && npm run build
cd ../backend && npm test            # confirm no regression (453 tests)
```

Manual: open `http://localhost:5173`, log in as any `docs/demo-accounts.md` account
(password `Demo@1234`) — confirm role-aware sidebar (Admin hidden for non-admin, Finance
hidden for contributor), the "Data as of 30 Sep 2026" topbar badge, logout + `next=` redirect
on re-login, and a 404 for an unknown path.
