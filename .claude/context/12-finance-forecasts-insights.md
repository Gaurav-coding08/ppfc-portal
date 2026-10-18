# 12 — Finance: forecasts, summaries, alerts & comparison (done 2026-10-18)

## What exists now
The forecast module lets PMs upsert monthly cost forecasts (after the asOf month, up to project end month) with audit. The summary module exposes per-project financial summaries (budget, actual, remaining, utilization, FTC, EAC, variance) plus spend-by-category, monthly trend, and alert flags — all driven by `fn_project_financials`. Cross-portfolio alert and comparison endpoints let dashboards show overrun/near-budget/forecast-missing warnings and side-by-side project financials, with proper scoping (non-visible projects excluded, never leaking data).

## Files
- `backend/db/migrations/014_finance_views.sql` — `v_spend_by_category` and `v_monthly_spend` views for Power BI
- `backend/src/modules/finance/forecasts.schemas.ts` — zod: `projectIdParamsSchema`, `forecastQuerySchema`, `upsertForecastsBodySchema`
- `backend/src/modules/finance/forecasts.repository.ts` — `listForecasts`, `forecastToComplete`, `upsertForecasts` (ON CONFLICT upsert)
- `backend/src/modules/finance/forecasts.service.ts` — list + upsert with month validation (> asOf, ≤ project end), audit
- `backend/src/modules/finance/forecasts.controller.ts` — HTTP handlers
- `backend/src/modules/finance/forecasts.routes.ts` — `projectForecastRoutes` (GET/PUT /:projectId/forecasts)
- `backend/src/modules/finance/summary.schemas.ts` — zod: `summaryQuerySchema`, `alertsQuerySchema`, `comparisonQuerySchema` (projectIds CSV → array, max 10)
- `backend/src/modules/finance/summary.repository.ts` — `getProjectFinancials`, `getProjectFinancialsMulti`, `getSpendByCategory`, `getMonthlyTrend`, `getAlerts`
- `backend/src/modules/finance/summary.service.ts` — `getProjectSummary`, `getAlerts`, `getComparison` (with visibility filtering)
- `backend/src/modules/finance/summary.controller.ts` — HTTP handlers
- `backend/src/modules/finance/summary.routes.ts` — `projectSummaryRoutes` (GET /:projectId/financial-summary) + `financeRoutes` (GET /alerts, GET /comparison)
- `backend/tests/integration/finance-insights.test.ts` — 13 tests
- `docs/api-routes.md` — 5 new endpoint rows
- `docs/data-dictionary.md` — Financial definitions section + alert thresholds

## Database
- New views: `v_spend_by_category`, `v_monthly_spend` (migration 014)
- No new tables or columns

## Endpoints
| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | /api/v1/projects/:projectId/forecasts | view | monthly rows + forecastToComplete at asOf |
| PUT | /api/v1/projects/:projectId/forecasts | manage | upsert by (project, month), audited |
| GET | /api/v1/projects/:projectId/financial-summary | view | full KPIs + spendByCategory + monthlyTrend + alerts |
| GET | /api/v1/finance/alerts | any (scoped) | OVERRUN_FORECAST, NEAR_BUDGET, OVERSPENT, FORECAST_MISSING |
| GET | /api/v1/finance/comparison | any (scoped) | side-by-side financials, non-visible → excluded |

## Reusable pieces (use these, don't rebuild)
- `summaryRepo.getProjectFinancials(projectId, asOf)` — single-project financial row from `fn_project_financials`
- `summaryRepo.getProjectFinancialsMulti(ids, asOf)` — multi-project variant with `ANY($2)`
- `summaryRepo.getSpendByCategory(projectId, asOf)` — posted costs grouped by category
- `summaryRepo.getMonthlyTrend(projectId, asOf)` — generate_series months LEFT JOIN actuals + forecasts
- `summaryRepo.getAlerts(asOf, scopeSql, scopeParams, departmentId?)` — all alert types with scope filtering
- `forecastsRepo.forecastToComplete(projectId, asOf)` — FTC sum for months > asOf month

## Decisions & trade-offs
- Monthly trend uses `generate_series` joined separately with actuals and forecasts to avoid fan-out double-counting
- Alerts are computed from the `is_overrun`, `is_near_budget`, `forecast_missing` flags already in `fn_project_financials`, plus an explicit `actual > budget` check for `OVERSPENT`
- Comparison endpoint filters project visibility in the service layer via `getProjectAccess`, keeping excluded IDs in the response so callers know what was dropped
- The `v_spend_by_category` and `v_monthly_spend` views use `fn_reporting_date()` for Power BI parity, while the API endpoints accept a custom `asOf`

## Known gaps / TODO for later features
- No PATCH on individual forecast rows (bulk PUT only)
- Alert thresholds (90% near-budget) are hard-coded in SQL; could be made configurable

## How to verify quickly
```bash
cd backend
npm run typecheck && npm run lint && npm test
# Specific tests
npx vitest run tests/integration/finance-insights.test.ts
```
