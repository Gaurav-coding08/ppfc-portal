import { queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { DashboardQuery } from '../types';

// One hook per dashboard endpoint, each its own query, so one failing
// widget shows its own error while the rest of the page renders (spec §A
// "one failing widget must not blank the page"). Every hook returns the
// API's `data` and `meta` untouched — the browser only displays them.
//
// None of these send `asOf`: the backend uses the reporting date from
// app_settings, the same date the topbar shows.

// Shared by the KPI cards and the topbar's "Data as of" badge
// (useReportingDate), which both read GET /dashboard/kpis. One queryFn per
// key keeps the cached shape consistent; the badge picks `meta.asOf` with
// `select`.
export function kpisQueryOptions(query: DashboardQuery) {
  return queryOptions({
    queryKey: queryKeys.dashboard.kpis(query),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/kpis', { params: { query } });
      if (error) throw toApiError(error, response);
      return { data: data!.data.kpis, meta: data!.meta };
    },
  });
}

export function useDashboardKpis(query: DashboardQuery) {
  return useQuery(kpisQueryOptions(query));
}

export function useBudgetVsActual(query: DashboardQuery) {
  return useQuery({
    queryKey: queryKeys.dashboard.widget('budget-vs-actual-eac', query),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/budget-vs-actual-eac', {
        params: { query },
      });
      if (error) throw toApiError(error, response);
      return { data: data!.data.projects, meta: data!.meta };
    },
  });
}

export function useMonthlySpend(query: DashboardQuery) {
  return useQuery({
    queryKey: queryKeys.dashboard.widget('monthly-spend', query),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/monthly-spend', { params: { query } });
      if (error) throw toApiError(error, response);
      return { data: data!.data.months, meta: data!.meta };
    },
  });
}

export function useSpendByCategory(query: DashboardQuery) {
  return useQuery({
    queryKey: queryKeys.dashboard.widget('spend-by-category', query),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/spend-by-category', {
        params: { query },
      });
      if (error) throw toApiError(error, response);
      return { data: data!.data.categories, meta: data!.meta };
    },
  });
}

export function useOverdueByOwner(query: DashboardQuery) {
  return useQuery({
    queryKey: queryKeys.dashboard.widget('overdue-by-owner', query),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/overdue-by-owner', {
        params: { query },
      });
      if (error) throw toApiError(error, response);
      return { data: data!.data.owners, meta: data!.meta };
    },
  });
}

export function useRiskMatrix(query: DashboardQuery) {
  return useQuery({
    queryKey: queryKeys.dashboard.widget('risk-matrix', query),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/risk-matrix', { params: { query } });
      if (error) throw toApiError(error, response);
      return { data: data!.data, meta: data!.meta };
    },
  });
}

export function useProjectHealth(query: DashboardQuery) {
  return useQuery({
    queryKey: queryKeys.dashboard.widget('project-health', query),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/project-health', {
        params: { query },
      });
      if (error) throw toApiError(error, response);
      return { data: data!.data.projects, meta: data!.meta };
    },
  });
}

/** Planned milestones due within the next `withinDays` days of the reporting date. */
export function useUpcomingMilestones(query: DashboardQuery, withinDays: number) {
  return useQuery({
    queryKey: queryKeys.dashboard.widget('milestones', { ...query, withinDays }),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/milestones', {
        params: { query: { ...query, withinDays } },
      });
      if (error) throw toApiError(error, response);
      return { data: data!.data.milestones, meta: data!.meta };
    },
  });
}
