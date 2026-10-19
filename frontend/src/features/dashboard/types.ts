import type { components } from '@/api/schema';

type Schemas = components['schemas'];

export type DashboardMeta = Schemas['DashboardMeta'];
export type Kpi = Schemas['DashboardKpi'];
export type KpiKey = Kpi['key'];
export type BudgetVsActualRow = Schemas['DashboardBudgetVsActualResponse']['data']['projects'][number];
export type ProjectHealthRow = Schemas['DashboardProjectHealthResponse']['data']['projects'][number];
export type MonthlySpendRow = Schemas['DashboardMonthlySpendResponse']['data']['months'][number];
export type CategorySpendRow = Schemas['DashboardSpendByCategoryResponse']['data']['categories'][number];
export type OverdueOwnerRow = Schemas['DashboardOverdueByOwnerResponse']['data']['owners'][number];
export type RiskMatrixData = Schemas['DashboardRiskMatrixResponse']['data'];
export type DashboardMilestone = Schemas['DashboardMilestonesResponse']['data']['milestones'][number];
export type DrillCostRow = Schemas['DashboardDrillCostsResponse']['data'][number];
export type DrillTaskRow = Schemas['DashboardDrillTasksResponse']['data'][number];
export type DrillRiskRow = Schemas['DashboardDrillRisksResponse']['data'][number];
export type DrillCrRow = Schemas['DashboardDrillChangeRequestsResponse']['data'][number];

/** Each widget gets its rows plus the meta that says which filters applied. */
export interface WidgetResult<T> {
  data: T;
  meta: DashboardMeta;
}

// The dashboard filter contract, exactly the params feature 13 accepts
// (backend dashboard.filters.ts). Values are URL strings; '' = no filter.
// `asOf` is deliberately not here: the reporting date comes from the
// backend and the timeframe selector never moves it (spec §A).
export const DASHBOARD_FILTER_DEFAULTS = {
  departmentId: '',
  projectId: '',
  managerId: '',
  status: '',
  from: '',
  to: '',
  categoryId: '',
};

export type DashboardFilters = typeof DASHBOARD_FILTER_DEFAULTS;

export type DashboardQuery = Partial<DashboardFilters>;

/** URL filters → API query: drops empty values so the cache key stays minimal. */
export function toDashboardQuery(filters: DashboardFilters): DashboardQuery {
  const query: DashboardQuery = {};
  for (const [key, value] of Object.entries(filters) as [keyof DashboardFilters, string][]) {
    if (value) query[key] = value;
  }
  return query;
}

/** The same query without the category filter. */
export function withoutCategory(query: DashboardQuery): DashboardQuery {
  const rest = { ...query };
  delete rest.categoryId;
  return rest;
}

/** True when the backend says this widget's numbers honour `categoryId`. */
export function categoryApplied(meta: DashboardMeta | undefined): boolean {
  return !!meta?.appliedFilters.includes('categoryId');
}

/** True when a category is selected but this widget's SQL doesn't use it. */
export function categoryIgnored(meta: DashboardMeta | undefined): boolean {
  return !!meta?.ignoredFilters.includes('categoryId');
}
