# 12 — Finance: forecasts, summaries, alerts & comparison

## Goal
Forecast capture and the read side of finance: per-project financial summary (budget, actual, remaining, utilization, FTC, EAC, variance), spend by category, monthly trend, budget-overrun alerts and project comparison — all from the SQL functions built in 02.

## Depends on
11-finance-budgets-costs

## Spec references
Assignment 2 §4 (forecasting, cost tracking, financial insight), financial definitions.

## Scope — module `modules/finance/` (`forecasts.*`, `summary.*`)

| Method | Path | Roles | Behaviour |
|---|---|---|---|
| GET | `/api/v1/projects/:projectId/forecasts` | view | monthly rows + `forecastToComplete` at asOf |
| PUT | `/api/v1/projects/:projectId/forecasts` | manage | body `{ months: [{ month: 'YYYY-MM', amount ≥ 0 }] }` — upsert by (project, month) in one tx; months must be **after** the asOf month and ≤ project end month (422 otherwise); amount 0 allowed; audited once with before/after arrays |
| GET | `/api/v1/projects/:projectId/financial-summary` | view | `?asOf`; returns the full row from `fn_project_financials(asOf)` + `spendByCategory[]` + `monthlyTrend[]` (month, actual posted, forecast) + `alerts[]` |
| GET | `/api/v1/finance/alerts` | any (scoped) | `?asOf&departmentId`; one row per triggered alert: `OVERRUN_FORECAST` (eac > budget), `NEAR_BUDGET` (utilization ≥ 90% and not overrun), `OVERSPENT` (actual > budget), `FORECAST_MISSING` (active project, no forecast); severity + amounts |
| GET | `/api/v1/finance/comparison` | any (scoped) | `?projectIds=1,2,3&asOf` (max 10 ids; ids the caller can't view are dropped and listed in `excluded`, so the response never reveals their data) → side-by-side financial rows |

### SQL rules
- Every number comes from `fn_project_financials` or a dedicated CTE-based query in the repository; no JS arithmetic beyond rounding.
- `spendByCategory`: posted, `txn_date <= asOf`, reversals negative, grouped by category.
- `monthlyTrend`: `generate_series` of months from project start to end; LEFT JOIN actual posted per month and forecast per month (two separate aggregates, then join on month).
- Add migration `010_finance_views.sql` with `v_spend_by_category` and `v_monthly_spend` (at reporting date) for Power BI parity.

### Docs
- `docs/data-dictionary.md` → "Financial definitions" section copied from CLAUDE.md + the forecast-missing treatment + the alert thresholds.

## Tests (`integration/finance-insights.test.ts`)
- Summary for the hand-checked seeded projects equals a raw SQL computation written **independently in the test** (not calling the same function) — this guards the definition.
- Overrun project appears as `OVERRUN_FORECAST`; near-budget project as `NEAR_BUDGET`; no-forecast project as `FORECAST_MISSING` with EAC = actual.
- `asOf=2026-10-31` includes the post-cutoff cost; default asOf excludes it.
- Forecast PUT for a past month → 422; contributor PUT → 403; upsert replaces existing month value.
- Monthly trend sums of actuals equal summary actual spend (no fan-out double counting).
- Comparison drops non-visible projects for a contributor and lists them in `excluded`.

## Acceptance
```
npm run typecheck && npm run lint && npm test
```

## Design rationale
EAC/FTC definition and the remaining-period method; forecast-missing treatment; how the test's independent SQL guards against a wrong shared function; why monthly trend uses two aggregates joined on a month series.
