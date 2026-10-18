# 13 — Executive dashboard analytics API (done 2026-10-18)

## What exists now
A scope-aware, filterable analytics module with 13 GET endpoints under `/api/v1/dashboard/`. Every endpoint recomputes from source tables on every request (no cache). The `filtered_projects` CTE pattern ensures consistent scoping and filtering across all endpoints: role-based project visibility is intersected with dashboard filters (department, project, manager, status, timeframe, categoryId). Finance endpoints honour `categoryId`; delivery endpoints report it in `ignoredFilters`. Every response carries a `meta` envelope with `asOf`, `appliedFilters`, `ignoredFilters`, and `generatedAt`. All queries run inside a read-only transaction with `SET LOCAL statement_timeout = '5s'`.

## Files
- `backend/src/modules/dashboard/dashboard.filters.ts` — shared zod schema, filter classification, `buildFilteredProjectsCte()`
- `backend/src/modules/dashboard/dashboard.schemas.ts` — drill-specific query schemas (costs, tasks, risks, CRs)
- `backend/src/modules/dashboard/dashboard.repository.ts` — KPI query (single SQL with 7 CTEs), project health, budget-vs-actual
- `backend/src/modules/dashboard/dashboard.visuals.repository.ts` — monthly spend, spend by category, overdue by owner, risk matrix, milestones, filter options
- `backend/src/modules/dashboard/dashboard.drill.repository.ts` — paginated drill-downs: costs, tasks, risks, change requests
- `backend/src/modules/dashboard/dashboard.service.ts` — orchestration: `withDashboardTx()`, builds CTE + meta for each endpoint
- `backend/src/modules/dashboard/dashboard.controller.ts` — 13 HTTP handlers
- `backend/src/modules/dashboard/dashboard.routes.ts` — 13 GET routes mounted at `/api/v1/dashboard`
- `backend/src/app.ts` — imports and mounts `dashboardRoutes`
- `backend/tests/integration/dashboard.test.ts` — 19 tests
- `docs/kpi-definitions.md` — detailed KPI definitions for Power BI reconciliation

## Database
No new tables, migrations, views or functions. Uses existing: `projects`, `tasks`, `milestones`, `risks`, `change_requests`, `cost_transactions`, `cost_categories`, `project_members`, `fn_project_progress()`, `fn_project_delivery_status(date)`, `fn_project_financials(date)`, `fn_exposure_band(int)`.

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/dashboard/kpis | any (scoped) | 16 KPIs with unit + drill |
| GET | /api/v1/dashboard/project-health | any (scoped) | per-project delivery + finance |
| GET | /api/v1/dashboard/budget-vs-actual-eac | any (scoped) | per-project financials |
| GET | /api/v1/dashboard/monthly-spend | any (scoped) | month series, respects categoryId |
| GET | /api/v1/dashboard/spend-by-category | any (scoped) | per category, respects categoryId |
| GET | /api/v1/dashboard/overdue-by-owner | any (scoped) | per assignee overdue count |
| GET | /api/v1/dashboard/risk-matrix | any (scoped) | 5×5 grid + totalOpenRisks |
| GET | /api/v1/dashboard/milestones | any (scoped) | planned milestones |
| GET | /api/v1/dashboard/drill/costs | any (scoped) | paginated posted costs |
| GET | /api/v1/dashboard/drill/tasks | any (scoped) | paginated tasks by kind |
| GET | /api/v1/dashboard/drill/risks | any (scoped) | paginated open risks |
| GET | /api/v1/dashboard/drill/change-requests | any (scoped) | paginated pending CRs |
| GET | /api/v1/dashboard/filters | any (scoped) | UI option lists |

## Reusable pieces (use these, don't rebuild)
- `dashboardFiltersSchema` — zod schema for the shared filter contract, reuse on any new dashboard endpoint
- `scopedProjectIdsSql(user, column?)` — now accepts optional `'p.id'` column for queries on the projects table directly (default `'project_id'` for fact tables)
- `buildFilteredProjectsCte(user, filters)` → `{ sql, params, asOf }` — the filtered_projects CTE builder, start every dashboard query from this
- `classifyFilters(filters, isFinanceEndpoint)` → `{ applied, ignored }` — consistent applied/ignored filter metadata
- `withDashboardTx(fn)` — wraps any dashboard query in a transaction with 5s statement timeout
- `buildMeta(asOf, filters, isFinance)` — builds the standard `{ asOf, appliedFilters, ignoredFilters, generatedAt }` meta envelope

## Decisions & trade-offs
- **Single KPI query** — all 16 KPIs computed in one SQL statement with 7 CTEs (proj, prog, task_stats, ms, risk_stats, cr_stats, fin) cross-joined. Avoids 16 round trips; the 5s timeout guards against runaway queries.
- **`scopedProjectIdsSql` column parameter** — the shared helper defaults to `AND project_id IN (...)` for fact tables, but accepts an optional `column` argument (typed as `'project_id' | 'p.id'`, validated against an allowlist). The CTE builder passes `'p.id'` directly since it queries `projects p` where the PK is `p.id`.
- **Drill params only pushed when referenced** — `drillTasks` only pushes `asOf` into the SQL params array when `kind=overdue` actually needs it. PostgreSQL rejects unreferenced positional parameters, so pushing it unconditionally caused 500s on `kind=all` and `kind=blocked`. Matches the pattern used by `drillRisks` and `drillChangeRequests`.
- **No pagination on KPIs/visuals** — KPIs return a fixed set of 16 rows; visual endpoints return bounded result sets (one row per project, category or month). Only drill-down endpoints are paginated.
- **categoryId applied/ignored** — finance endpoints (monthly-spend, spend-by-category, drill/costs, budget-vs-actual, kpis) honour categoryId in their SQL. Delivery endpoints (project-health, overdue-by-owner, risk-matrix, milestones, drill/tasks, drill/risks, drill/change-requests) report it in `meta.ignoredFilters`.

## Known gaps / TODO for later features
- No WebSocket or SSE for live dashboard updates
- Risk matrix does not support `from`/`to` timeframe filter unless `riskTimeframe=true` is passed
- Monthly spend `generate_series` uses project date range — a cross-project view shows the union of all project months

## How to verify quickly
```bash
cd backend && npm test -- --reporter=verbose tests/integration/dashboard.test.ts
```
Key tests: "every KPI drill.endpoint returns 200", "drill/costs sum == actualSpend", "contributor KPIs equal admin KPIs filtered to contributor member projects", "risk matrix total == count of open risks".
