import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';
import type { CostListFilters } from '../types';

export const COST_PAGE_SIZE = 20;

// Every read here omits `asOf`, so the backend applies the reporting date
// (app_settings.reporting_date) — the same date the topbar badge shows.

/** KPIs, spend by category, monthly trend and alerts — all computed in SQL. */
export function useFinancialSummary(projectId: number) {
  return useQuery({
    queryKey: queryKeys.finance.summary(projectId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{projectId}/financial-summary', {
        params: { path: { projectId } },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
  });
}

/** Initial budget, approved total and every revision (any status). */
export function useBudget(projectId: number) {
  return useQuery({
    queryKey: queryKeys.finance.budget(projectId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{projectId}/budget', {
        params: { path: { projectId } },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
  });
}

type CostQuery = NonNullable<paths['/projects/{projectId}/costs']['get']['parameters']['query']>;

// URL params are strings; the API wants numbers and no empty values.
export function useProjectCosts(projectId: number, filters: CostListFilters) {
  return useQuery({
    queryKey: queryKeys.finance.costs(projectId, filters),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{projectId}/costs', {
        params: {
          path: { projectId },
          query: {
            status: filters.status || undefined,
            categoryId: filters.categoryId ? Number(filters.categoryId) : undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
            sort: filters.sort as CostQuery['sort'],
            order: filters.order as CostQuery['order'],
            page: Number(filters.page) || 1,
            pageSize: COST_PAGE_SIZE,
          },
        },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export function useForecasts(projectId: number) {
  return useQuery({
    queryKey: queryKeys.finance.forecasts(projectId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{projectId}/forecasts', {
        params: { path: { projectId } },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
  });
}

/** Active categories for every role; `includeInactive` only has an effect for admins. */
export function useCostCategories(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.finance.categories(includeInactive),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/cost-categories', {
        params: { query: { includeInactive: includeInactive ? 'true' : undefined } },
      });
      if (error) throw toApiError(error, response);
      return data!.data ?? [];
    },
  });
}

/** Alerts across the caller's projects (backend-scoped). */
export function useFinanceAlerts(departmentId: string) {
  return useQuery({
    queryKey: queryKeys.finance.alerts({ departmentId }),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/finance/alerts', {
        params: { query: { departmentId: departmentId ? Number(departmentId) : undefined } },
      });
      if (error) throw toApiError(error, response);
      return data!.data?.alerts ?? [];
    },
    placeholderData: keepPreviousData,
  });
}

/** Side-by-side financials. Disabled until at least one project is picked. */
export function useFinanceComparison(projectIds: number[]) {
  return useQuery({
    queryKey: queryKeys.finance.comparison(projectIds),
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/finance/comparison', {
        params: { query: { projectIds: projectIds.join(',') } },
      });
      if (error) throw toApiError(error, response);
      return { projects: data!.data?.projects ?? [], excluded: data!.data?.excluded ?? [] };
    },
    placeholderData: keepPreviousData,
  });
}
