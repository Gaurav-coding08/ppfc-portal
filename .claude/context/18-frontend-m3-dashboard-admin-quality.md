# 18 — Frontend Milestone 3: dashboard, admin, automation & quality

## Part A (done 2026-10-19)

### What exists now

The executive dashboard (module 06) at `/dashboard`, the landing page after login. It has:
- six URL filters;
- three KPI sections (Delivery, Risk & governance, Financial) with definition tooltips;
- seven independently loading widgets: budget/actual/EAC by project, monthly cost trend, spend by category, a 5×5 risk matrix, overdue work by owner, a project health table and a 90-day milestone roadmap;
- a right-side drill drawer showing "N records · <clicked figure>" so a KPI can be reconciled with its rows.

Every number comes from the feature 13 endpoints; the browser only displays them.

### Files

- `frontend/src/features/dashboard/types.ts` — API-derived types, `DASHBOARD_FILTER_DEFAULTS`, `toDashboardQuery`, `withoutCategory`, `categoryApplied`/`categoryIgnored` (read from response meta)
- `features/dashboard/drill.ts` — `DrillTarget`/`DrillRequest` (kind, params, title, `includeCategory`, `reconcile`)
- `features/dashboard/kpiCatalog.ts` — `KPI_META` (label, definition, drill) and `KPI_SECTIONS`
- `features/dashboard/timeframe.ts` — period presets from the reporting year (string-built), custom-range fallback
- `features/dashboard/hooks/useDashboardQueries.ts` — `kpisQueryOptions`, `useDashboardKpis`, `useBudgetVsActual`, `useMonthlySpend`, `useSpendByCategory`, `useOverdueByOwner`, `useRiskMatrix`, `useProjectHealth`, `useUpcomingMilestones`
- `features/dashboard/hooks/useDrillQuery.ts` — one paginated drill hook for costs/tasks/risks/CRs
- `features/dashboard/components/` — `DashboardFilterBar`, `KpiSections` (+`KpiValue`), `Widget` (+`CategoryChip`), `FinanceVisuals` (budget-vs-actual, spend by category), `MonthlySpendChart`, `DeliveryVisuals` (overdue by owner, project health table, milestone timeline), `RiskMatrix` (CSS grid), `DrillDrawer`, `drillColumns`, `FilterContext`, `LastUpdated`
- `features/dashboard/pages/DashboardPage.tsx` (+ `.test.tsx`, 6 tests); lazy route in `app/router.tsx`
- `components/display/chartTheme.ts` — shared `AXIS_TICK`, `GRID`, `SERIES`, `CATEGORY_COLORS`, `compactAed`, `moneyTooltip` (FinanceCharts now imports it)
- `components/layout/useReportingDate.ts` — now shares `kpisQueryOptions({})` with `select`
- `features/projects/hooks/useReferenceData.ts` — `useProjectFilterOptions` also returns `categories`
- `api/queryKeys.ts` — `dashboard.widget(name, filters)`, `dashboard.drill(kind, params)`
- `test/fixtures/dashboard.ts` — `dashboardHandlers(calls)`, `dashboardMeta`, `kpisData`
- **Backend:** `dashboard.service.ts`/`dashboard.filters.ts` (category meta fix), `dashboard.repository.ts` (`name`, `isOverrun`), 2 tests in `dashboard.test.ts`
- `docs/openapi.yaml` — every dashboard path has params and a response schema; `docs/api-routes.md`, `docs/kpi-definitions.md` updated

### Database

None.

### Endpoints / Pages

| Route | Roles | Notes |
|---|---|---|
| `/dashboard` | any (data scoped by API) | `?departmentId&projectId&managerId&status=a,b&from&to&categoryId` |

No new endpoints. Two existing responses changed (additive or metadata-only):
- `GET /dashboard/kpis` and `/dashboard/budget-vs-actual-eac` now report `categoryId` in `meta.ignoredFilters`.
- `budget-vs-actual-eac` rows gained `name` and `isOverrun`.

Calls: all 13 `/dashboard/*` GETs (filters, kpis, 7 visuals, 4 drills).

### Reusable pieces (use these, don't rebuild)

- `Widget({ title, query, isEmpty, onReset, children(data, meta) })` — card with skeleton / error+requestId+Retry / empty+Reset; one per query
- `CategoryChip({ meta })` — "Filtered by category" vs "All categories" from meta
- `DrillDrawer({ request, query, onClose })` + `DrillRequest` — any new drill source just builds a request
- `kpisQueryOptions(query)` — the only queryFn for `dashboard.kpis(...)`; reuse it rather than writing a second one under the same key
- `chartTheme.ts` — fixed series colours for any new recharts chart
- `dashboardHandlers(calls)` — msw for every dashboard endpoint, records query params

### Decisions & trade-offs

- **Backend meta fix (not a new route).** `/kpis` and `/budget-vs-actual-eac` claimed `categoryId` as applied, but their numbers didn't change: `fn_project_financials` has no category dimension. Verified live: identical values with and without it. They now report it as ignored. The UI's chip and drill logic read meta, so they show "All categories" truthfully. A regression test asserts the meta and that the data is unchanged.
- **`isOverrun` added to budget-vs-actual** so the overrun highlight comes from the same SQL flag as `projectedOverrunCount`, instead of the browser comparing EAC with budget. Test: count of flagged rows == the KPI.
- **Drill inherits the source widget's filter context.** When the source ignored category (the Actual spend KPI, budget chart), the drill omits `categoryId`; otherwise "N records" wouldn't reconcile with the card. Spend-by-category bars keep it.
- **"N records · total X"**: N is `meta.total` from the drill endpoint; X is the figure that was clicked (the KPI value or bar amount, as returned by the API). Drill endpoints return no sum, and the browser doesn't add money.
- **Query-key collision found and fixed.** `useReportingDate` cached `dashboard.kpis({})` as a bare `asOf` string, while the unfiltered dashboard needs `{data, meta}` under the same key. Both now use `kpisQueryOptions`, and the badge uses `select`. This is also why the dashboard doesn't fetch KPIs twice.
- **Empty risk-matrix cells are neutral.** The API returns only non-empty cells with their band, so the browser never derives a band from p × i.
- **Timeframe** presets are string-built from the reporting year (YTD, Q1–Q4, full year, next year), and a non-preset range shows as "Custom". The reporting date is never sent; a note explains that financial figures stay as-of while the timeframe narrows tasks, milestones and CRs.
- **Milestone timeline** dots are positioned by the API's `daysToDue` / 90.
- **Last updated** shows the server's `meta.generatedAt`. Refresh invalidates `dashboard.all`, the same path every mutation hook takes.

### Known gaps / TODO for later parts

- Chart bars are mouse-clickable only. The keyboard path to the same records is the KPI cards, the risk-matrix cells and the project-health overdue badges. Revisit in the Part C accessibility pass.
- The monthly trend has no drill (the `drill/costs?month=` param exists, but drill-from-line-point UX is awkward).
- Milestones-due KPI has no drawer (no paginated milestone drill endpoint); the 90-day roadmap widget is its breakdown.
- Main bundle still triggers Vite's 500 KB warning (549 KB); the dashboard is its own 31 KB lazy chunk.

### How to verify quickly

```bash
cd frontend && npm run typecheck && npm run lint && npm test && npm run build   # 75 tests
cd ../backend && npm test                                                     # 456 tests
```

## Part B (done 2026-10-19)

### What exists now

Admin, audit, automation and notifications (module 07, §8.1 visible outcome). `/admin/users` (filters, create user, change role through a confirm step, activate/deactivate, departments list), `/admin/audit-log` (entity/actor/date filters, rows expand into a field-level before/after diff, entity links), `/admin/automation` (runs log with trigger/duration/status, **Run now** → summary toast → refetch; outbox tab with status filter and confirmed **Retry**), and notifications: a topbar bell (server `unreadCount`, 60 s poll + focus refetch, dropdown with mark-as-read) plus `/notifications` (All/Unread). Every nav entry now has a real page.

### Files

- `features/admin/` — `types.ts` (`AdminUser`, `AuditEvent`, `ROLE_OPTIONS`, `roleLabel`, URL defaults, `AUDIT_ENTITY_TYPES`), `schemas.ts` (create-user zod, mirrors backend password policy), `auditLinks.ts` (`auditEntityHref`, `diffSnapshots`), `hooks/useAdminQueries.ts` (`useAdminUsers`, `useActorOptions`, `useAuditEvents`), `hooks/useAdminMutations.ts` (`useCreateUser`, `useUpdateUser`), `components/` (`CreateUserDialog`, `ChangeRoleFlow`, `userColumns`, `AuditDiff`), `pages/UsersPage`, `pages/AuditLogPage`, `pages/AdminPages.test.tsx` (4)
- `features/automation/` — `types.ts` (labels, `formatDuration`), `hooks/useAutomation.ts` (runs, outbox, `useRunEscalation`, `useRetryOutboxEvent`), `components/RunsTable`, `OutboxTable`, `pages/AutomationPage` (+ test, 2)
- `features/notifications/` — `links.ts` (`notificationHref`), `hooks/useNotifications.ts`, `components/NotificationItem`, `NotificationBell` (+ test, 2), `pages/NotificationsPage`
- `components/ui/popover.tsx` — shadcn CLI generated (bell dropdown)
- `components/display/StatusBadge.tsx` — `automationRun`, `outbox` domains
- `components/layout/Topbar.tsx` — renders `NotificationBell`; `PlaceholderPage.tsx` deleted (unused)
- `app/router.tsx` — 4 lazy pages, `/notifications`, `/admin/audit` → `/admin/audit-log` redirect
- `api/queryKeys.ts` — `admin`, `automation`, `notifications`
- `test/fixtures/admin.ts`, `test/handlers.ts` (default empty `/notifications`), `Sidebar.test.tsx` (+1 PM case)
- **Backend:** `db/migrations/016_automation_run_trigger.sql`; `startRun(jobName, trigger)`; `listRuns` returns `trigger`; test in `automation-producer.test.ts`
- `docs/openapi.yaml` (see Decisions), `docs/api-routes.md`, `docs/data-dictionary.md`, `docs/automation.md`

### Database

- Migration 016: `automation_runs.trigger TEXT NOT NULL DEFAULT 'schedule' CHECK (trigger IN ('schedule','manual'))`.

### Endpoints / Pages

| Route | Roles | Notes |
|---|---|---|
| `/admin/users` | admin (others: ForbiddenState, no API call) | `?q&role&departmentId&sort&order&page` |
| `/admin/audit-log` (`/admin/audit` redirects) | admin | `?entityType&actorId&from&to&page` |
| `/admin/automation` | admin | `?tab=runs\|outbox&status&page` |
| `/notifications` | any | `?unread=true&page` |

No new endpoints. One response gained a field: `GET /admin/automation/runs` rows now carry `trigger`. Calls: `GET /users`, `GET /departments`, `POST /admin/users`, `PATCH /admin/users/:id`, `GET /admin/audit-events`, the four `/admin/automation/*` routes, `GET /notifications`, `PATCH /notifications/:id/read`.

### Reusable pieces (use these, don't rebuild)

- `NotificationItem({ notification, onMarkRead, marking, onNavigate? })` — one row for any notifications list
- `notificationHref(link)` — backend resource path → SPA route (null when unknown)
- `auditEntityHref(event)` / `AuditDiff({ before, after })` — any future audit/activity view
- `ChangeRoleFlow` — pattern for "pick, then confirm" without stacking dialogs (`step` state, mounted with `key={user.id}`)
- `queryKeys.notifications.all` — invalidate after anything that creates notifications (Run now already does)
- `test/fixtures/admin.ts` — `adminUser`, `auditEvent`, `automationRun`, `outboxEvent`, `notification`, `departmentsHandler`

### Decisions & trade-offs

- **Trigger column added (owner chose this).** The spec's runs table has a Trigger column, but `automation_runs` didn't store it (only logged). Deriving it from audit rows would have mislabelled CLI runs, which write no audit row. Migration 016 is additive; rows from before it read `schedule` (so the dev DB's earlier CLI runs show Scheduled).
- **Bell count comes only from the server.** Mark-as-read invalidates `notifications.all`; the test returns `unreadCount: 0` after marking one of two, so a local decrement (→1) would fail it.
- **Admin pages gate on `isAdmin` before querying.** A non-admin on a direct URL sees ForbiddenState and no admin request is made (test asserts zero calls). The backend 403 is still the rule.
- **Self role change / last-admin guard are left to the backend.** "Change role" shows on the admin's own row; the 422 message and request id appear in the dialog.
- **Run duration is computed in the browser** from `startedAt`/`finishedAt` for display only; it's not a KPI or a business number.
- **Notification links are mapped**: backend stores `/projects/:p/tasks/:t` and `/projects/:p/change-requests/:c`; the SPA has no task page, so tasks open the project Tasks tab and CRs open `/change-requests/:id`.
- **`unread` is sent only when true**: the backend's `z.coerce.boolean()` turns `"false"` into true. Documented in OpenAPI.
- **Audit diff compares by JSON text per top-level field** and marks changes with "(changed)" text, not colour alone.
- **Route stays `/admin/audit-log`** (nav since M1); the spec's `/admin/audit` redirects.
- **OpenAPI fixed rather than casting:** admin user POST/PATCH response schemas and role enum; audit-events params (`entityId/action/from/to`) and response; all six automation + notification paths were missing and are now documented from live responses. `routes:check` still 77/77.

### Known gaps / TODO for later parts

- No department CRUD (API has none); departments card is read-only.
- No user name edit or department change in the UI (PATCH supports them); only role and active status.
- Audit actor filter lists the first 100 users (API max page size); fine for the seed (15).
- Run now uses no Idempotency-Key (not in CLAUDE.md's list; the job is idempotent per day and a concurrent call gets 409).
- Part C: responsive/a11y pass, Playwright E2E, Docker `web`, docs/screenshots.

### How to verify quickly

```bash
cd backend && npm run db:migrate && npm test          # 457 tests, routes:check 77/77
cd frontend && npm run typecheck && npm run lint && npm test && npm run build   # 87 tests
```
