import type { components } from '@/api/schema';

export type Cost = components['schemas']['CostTransaction'];
export type CostCategory = components['schemas']['CostCategory'];
export type BudgetRevision = components['schemas']['BudgetRevision'];
export type BudgetSummary = components['schemas']['BudgetSummary'];
export type ProjectFinancials = components['schemas']['ProjectFinancials'];
export type FinanceAlert = components['schemas']['FinanceAlert'];
export type MonthlyTrendRow = components['schemas']['MonthlyTrendRow'];
export type SpendByCategoryRow = components['schemas']['SpendByCategoryRow'];
export type Forecast = components['schemas']['Forecast'];
export type AlertType = NonNullable<FinanceAlert['alertType']>;

// Mirrors the backend's cost status list (costs.schemas.ts).
export const COST_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
];

// The Finance tab's costs table URL params (all strings, as the URL holds
// them). Newest first, like the backend default.
export const COST_LIST_DEFAULTS = {
  status: '',
  categoryId: '',
  from: '',
  to: '',
  sort: 'txnDate',
  order: 'desc',
  page: '1',
};

export type CostListFilters = typeof COST_LIST_DEFAULTS;

// Every key the Finance tab writes — cleared when the user leaves the tab.
export const FINANCE_FILTER_KEYS = Object.keys(COST_LIST_DEFAULTS);

export const ALERT_LABELS: Record<AlertType, { title: string; detail: string }> = {
  OVERRUN_FORECAST: {
    title: 'Overrun forecast',
    detail: 'Estimate at completion is above the current approved budget.',
  },
  OVERSPENT: { title: 'Overspent', detail: 'Actual spend is already above the current approved budget.' },
  NEAR_BUDGET: { title: 'Near budget', detail: 'Actual spend has reached 90 % or more of the budget.' },
  FORECAST_MISSING: {
    title: 'Forecast missing',
    detail: 'No forecast is recorded, so EAC equals actual spend.',
  },
};

// One-line definitions for the summary cards — copied from CLAUDE.md
// "Financial definitions". They describe what the backend computed; the
// browser never applies them.
export const KPI_DEFINITIONS = {
  currentBudget:
    'Initial approved budget plus approved budget revisions. Pending and rejected revisions have no effect.',
  actualSpend:
    'Sum of posted cost transactions dated on or before the as-of date. Reversals subtract; drafts are excluded.',
  remainingBudget: 'Current approved budget minus actual spend.',
  utilization: 'Actual spend divided by the current approved budget. Shown as — when the budget is 0.',
  forecastToComplete: 'Sum of forecasts for the months after the as-of month.',
  eac: 'Estimate at completion: actual spend plus forecast to complete.',
  projectedVariance: 'Current approved budget minus EAC. Negative means a projected overrun.',
} as const;
