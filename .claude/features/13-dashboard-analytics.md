# 13 — Executive dashboard analytics API

## Goal
Scope-aware, filterable analytics endpoints that power the executive web dashboard: every KPI card, at least five visuals, cross-filters and drill-downs to row-level records — recomputed from SQL on every request, no cached or client-patched totals. Journey 6 and acceptance tests **E** (and the SQL side of F).

## Depends on
08-tasks-milestones, 09-risks-issues, 10-change-requests, 12-finance-forecasts-insights

## Spec references
Assignment 2 §5 (all), §1 journey 6, §3.3 fan-out warning, §10 test E.

## Shared filter contract (zod schema `dashboardFilters`, used by every endpoint)
`departmentId[]`, `projectId[]`, `managerId[]` (project owner), `status[]` (project lifecycle), `from`, `to` (timeframe), `categoryId[]` (finance endpoints only — ignored elsewhere and echoed back in `meta.ignoredFilters`), `asOf`.
Every response: `{ data, meta: { asOf, appliedFilters, ignoredFilters, generatedAt } }`.

Build filters once in `dashboard.filters.ts` → produces a `filtered_projects` CTE (scope ∩ filters). **Every query starts from that CTE**, then aggregates each fact in its own CTE before joining. Comment this pattern at the top of `dashboard.repository.ts`.

Timeframe semantics (document): tasks/milestones filtered by due date; costs by `txn_date`; CRs by `submitted_at`; risks by `created_at` (open risks are always "as of" — not timeframe-filtered unless the client asks with `riskTimeframe=true`).

## Endpoints — module `modules/dashboard/`

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/dashboard/kpis` | **Delivery:** totalProjects, activeProjects, portfolioProgressPct (weighted), taskCompletionPct, overdueIncompleteTasks, milestonesDue14d. **Risk & governance:** openHighExposureRisks, blockedTasks, pendingChangeRequests. **Financial:** approvedBudget, actualSpend, remainingBudget, utilizationPct, forecastEac, projectedOverrunCount, projectedOverrunAmount. Each KPI: `{ key, value, unit: 'count'\|'pct'\|'AED', drill: { endpoint, params } }` |
| GET | `/api/v1/dashboard/project-health` | per project: progress, deliveryStatus, utilization, eac vs budget, open high risks, overdue tasks |
| GET | `/api/v1/dashboard/budget-vs-actual-eac` | per project: currentBudget, actualSpend, eac |
| GET | `/api/v1/dashboard/monthly-spend` | month series: actual posted, forecast, cumulative actual (respects categoryId) |
| GET | `/api/v1/dashboard/spend-by-category` | per category (respects categoryId) |
| GET | `/api/v1/dashboard/overdue-by-owner` | per assignee (incl. "Unassigned") count of overdue incomplete tasks |
| GET | `/api/v1/dashboard/risk-matrix` | 5×5 grid probability × impact counts of open risks, with band |
| GET | `/api/v1/dashboard/milestones` | `?withinDays=14` upcoming + overdue milestones (roadmap) |
| GET | `/api/v1/dashboard/drill/costs` | posted costs ≤ asOf behind actualSpend for current filters (+ optional `projectId`, `categoryId`, `month`), paginated, with `total` that equals the KPI |
| GET | `/api/v1/dashboard/drill/tasks` | `?kind=overdue\|blocked\|all&ownerId&projectId` paginated |
| GET | `/api/v1/dashboard/drill/risks` | `?kind=high-exposure\|cell&probability&impact` paginated |
| GET | `/api/v1/dashboard/drill/change-requests` | pending CRs for filters |
| GET | `/api/v1/dashboard/filters` | option lists for the UI: departments, projects, managers, statuses, categories — scoped |

### Integrity rules
- No caching layer. Each request recomputes from source tables.
- Drill-down `total`/sum must equal the KPI it came from for the same filters (tested).
- Contributor dashboards are limited to member projects automatically via the scope CTE.
- Statement timeout 5s on dashboard queries (set per query via `SET LOCAL statement_timeout` inside a tx).

### Docs
- `docs/kpi-definitions.md`: for at least 6 KPIs — source tables, filter context, SQL (pasted), and how the drill-down reproduces it. This feeds the Power BI reconciliation later.

## Tests (`integration/dashboard.test.ts`)
- **Integrity after mutation (spec §5 mandatory demo):** read `kpis` → contributor updates a task's progress → `portfolioProgressPct` changes to the expected value; PM posts a cost → `actualSpend` increases by exactly that amount. No other code path updates these numbers.
- Drill reconciliation: `drill/costs` sum == `actualSpend`; `drill/tasks?kind=overdue` count == `overdueIncompleteTasks`; `drill/risks?kind=high-exposure` count == `openHighExposureRisks` — each for (a) no filters and (b) department + status filter.
- **Fan-out guard:** for one project, `actualSpend` from the dashboard equals a direct `SUM` on `cost_transactions` even though the project has many tasks and risks.
- `categoryId` changes finance endpoints but is reported as ignored on delivery endpoints.
- Contributor KPIs equal admin KPIs filtered to that contributor's member projects.
- Every KPI's `drill.endpoint` exists and returns 200.
- Risk matrix total == count of open risks for the filters.

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Interview talking points
The `filtered_projects` CTE pattern; why aggregates are computed per fact table then joined; how drill-downs prove the KPI; timeframe semantics per entity; how the same definitions feed Power BI.
