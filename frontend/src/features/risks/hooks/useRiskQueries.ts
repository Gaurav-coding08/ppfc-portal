import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';
import type { ProjectRiskFilters, RiskListFilters } from '../types';

export const RISK_PAGE_SIZE = 20;

type RiskListQuery = NonNullable<paths['/risks']['get']['parameters']['query']>;

// URL params are strings; the API wants numbers and no empty values.
function toRiskQuery(f: ProjectRiskFilters): RiskListQuery {
  return {
    q: f.q || undefined,
    status: f.status || undefined,
    type: (f.type || undefined) as RiskListQuery['type'],
    sort: f.sort as RiskListQuery['sort'],
    order: f.order as RiskListQuery['order'],
    page: Number(f.page) || 1,
    pageSize: RISK_PAGE_SIZE,
  };
}

export function useProjectRisks(projectId: number, filters: ProjectRiskFilters) {
  return useQuery({
    queryKey: queryKeys.risks.projectList(projectId, filters),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{projectId}/risks', {
        params: { path: { projectId }, query: toRiskQuery(filters) },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

// Cross-portfolio list, scoped by the backend to the caller's projects.
export function usePortfolioRisks(filters: RiskListFilters) {
  return useQuery({
    queryKey: queryKeys.risks.list(filters),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/risks', {
        params: {
          query: {
            ...toRiskQuery(filters),
            projectId: filters.projectId ? Number(filters.projectId) : undefined,
            departmentId: filters.departmentId ? Number(filters.departmentId) : undefined,
          },
        },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

// The backend decides what "high exposure" means (open/mitigating, score
// >= 15) and the order (score desc). The page renders the rows as given.
export function useHighExposureRisks(page: number) {
  return useQuery({
    queryKey: queryKeys.risks.highExposure({ page }),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/risks/high-exposure', {
        params: { query: { page, pageSize: RISK_PAGE_SIZE } },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}
