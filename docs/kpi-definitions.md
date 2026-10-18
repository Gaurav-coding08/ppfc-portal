# KPI definitions

Reference for the 16 KPIs returned by `GET /api/v1/dashboard/kpis`. Each entry names the source tables, the SQL aggregation (inside the single-query CTE approach), filter context and how the drill-down reproduces the number.

All KPIs are recomputed on every request from source tables — no caching or materialised views. The query runs inside a read-only transaction with a 5-second statement timeout. Scoping is enforced by the `filtered_projects` CTE (role-based scope ∩ dashboard filters).

Default reporting date: `2026-09-30` (from `app_settings.reporting_date`; overridden by `?asOf=`).

---

## 1. totalProjects

- **Unit:** count
- **Source:** `projects`
- **SQL:** `COUNT(*) FROM projects p WHERE p.id IN (SELECT id FROM filtered_projects)`
- **Filters:** all dashboard filters (department, project, manager, status, timeframe)
- **Drill:** `GET /api/v1/dashboard/project-health`

## 2. activeProjects

- **Unit:** count
- **Source:** `projects`
- **SQL:** `COUNT(*) FILTER (WHERE p.status = 'active') FROM projects p WHERE p.id IN (SELECT id FROM filtered_projects)`
- **Drill:** `GET /api/v1/dashboard/project-health?status=active`

## 3. portfolioProgressPct

- **Unit:** pct
- **Source:** `fn_project_progress()` (tasks table, weighted by `task.weight`)
- **SQL:** `SUM(pp.progress_pct * pp.task_count) / NULLIF(SUM(pp.task_count), 0)` — weighted average across filtered projects
- **Filters:** project-level filters only (not task-level timeframe)
- **Drill:** `GET /api/v1/dashboard/project-health`

## 4. taskCompletionPct

- **Unit:** pct
- **Source:** `tasks`
- **SQL:** `COUNT(*) FILTER (WHERE t.status = 'done') / COUNT(*) * 100` for tasks in filtered projects, respects `from`/`to` on `due_date`
- **Drill:** `GET /api/v1/dashboard/drill/tasks?kind=all`

## 5. overdueIncompleteTasks

- **Unit:** count
- **Source:** `tasks`
- **SQL:** `COUNT(*) FILTER (WHERE t.status <> 'done' AND t.due_date < asOf::date)` for tasks in filtered projects, respects `from`/`to`
- **Drill:** `GET /api/v1/dashboard/drill/tasks?kind=overdue`
- **Reconciliation:** `drill/tasks?kind=overdue&pageSize=1` → `meta.total` must equal this KPI for the same filters

## 6. milestonesDue14d

- **Unit:** count
- **Source:** `milestones`
- **SQL:** `COUNT(*) WHERE m.status = 'planned' AND m.due_date BETWEEN asOf AND (asOf + 14)` for filtered projects, respects `from`/`to`
- **Drill:** `GET /api/v1/dashboard/milestones?withinDays=14`

## 7. openHighExposureRisks

- **Unit:** count
- **Source:** `risks`
- **SQL:** `COUNT(*) FILTER (WHERE r.score >= 15) WHERE r.status <> 'closed'` for filtered projects
- **Drill:** `GET /api/v1/dashboard/drill/risks?kind=high-exposure`
- **Reconciliation:** `drill/risks?kind=high-exposure&pageSize=1` → `meta.total` must equal this KPI

## 8. blockedTasks

- **Unit:** count
- **Source:** `tasks`
- **SQL:** `COUNT(*) FILTER (WHERE t.status = 'blocked')` for tasks in filtered projects, respects `from`/`to`
- **Drill:** `GET /api/v1/dashboard/drill/tasks?kind=blocked`

## 9. pendingChangeRequests

- **Unit:** count
- **Source:** `change_requests`
- **SQL:** `COUNT(*) WHERE cr.status = 'submitted'` for filtered projects, respects `from`/`to` on `submitted_at`
- **Drill:** `GET /api/v1/dashboard/drill/change-requests`

## 10. approvedBudget

- **Unit:** AED
- **Source:** `fn_project_financials(asOf)` → `current_budget`
- **SQL:** `SUM(f.current_budget)` — initial budget + Σ approved revisions with `effective_date <= asOf`
- **Drill:** `GET /api/v1/dashboard/budget-vs-actual-eac`

## 11. actualSpend

- **Unit:** AED
- **Source:** `fn_project_financials(asOf)` → `actual_spend`
- **SQL:** `SUM(f.actual_spend)` — Σ posted costs with `txn_date <= asOf` (reversals subtract)
- **Drill:** `GET /api/v1/dashboard/drill/costs`
- **Reconciliation:** `drill/costs` rows summed (expense − reversal) must equal this KPI. The fan-out guard test verifies a single-project dashboard actual equals the direct SUM on `cost_transactions`.

## 12. remainingBudget

- **Unit:** AED
- **Source:** `fn_project_financials(asOf)` → `remaining_budget`
- **SQL:** `SUM(f.remaining_budget)` — current budget − actual spend
- **Drill:** `GET /api/v1/dashboard/budget-vs-actual-eac`

## 13. utilizationPct

- **Unit:** pct
- **Source:** `fn_project_financials(asOf)`
- **SQL:** `SUM(actual_spend) / NULLIF(SUM(current_budget), 0) * 100` — null when budget is 0
- **Drill:** `GET /api/v1/dashboard/budget-vs-actual-eac`

## 14. forecastEac

- **Unit:** AED
- **Source:** `fn_project_financials(asOf)` → `eac`
- **SQL:** `SUM(f.eac)` — actual spend + forecast-to-complete (months after asOf month)
- **Drill:** `GET /api/v1/dashboard/budget-vs-actual-eac`

## 15. projectedOverrunCount

- **Unit:** count
- **Source:** `fn_project_financials(asOf)` → `is_overrun`
- **SQL:** `COUNT(*) FILTER (WHERE f.is_overrun)` — projects where EAC > current budget
- **Drill:** `GET /api/v1/dashboard/budget-vs-actual-eac`

## 16. projectedOverrunAmount

- **Unit:** AED
- **Source:** `fn_project_financials(asOf)` → `eac`, `current_budget`
- **SQL:** `SUM(f.eac - f.current_budget) FILTER (WHERE f.is_overrun)` — total overrun across all overrunning projects
- **Drill:** `GET /api/v1/dashboard/budget-vs-actual-eac`

---

## How to reconcile with Power BI

1. Run the dashboard with `?asOf=YYYY-MM-DD` matching the Power BI report date.
2. Compare each KPI value against the Power BI visual that uses `v_spend_by_category` or `v_monthly_spend`.
3. For any mismatch, use the drill endpoint to get row-level records and compare against the source query.
4. Financial KPIs all flow through `fn_project_financials(asOf)`, which is the single source of truth.
