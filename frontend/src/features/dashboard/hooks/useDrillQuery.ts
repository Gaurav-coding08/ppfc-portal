import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import { DRILL_PAGE_SIZE, type DrillRequest } from '../drill';
import type {
  DashboardMeta,
  DashboardQuery,
  DrillCostRow,
  DrillCrRow,
  DrillRiskRow,
  DrillTaskRow,
} from '../types';

type PagedMeta = DashboardMeta & { page: number; pageSize: number; total: number };

export type DrillResult =
  | { kind: 'costs'; rows: DrillCostRow[]; meta: PagedMeta }
  | { kind: 'tasks'; rows: DrillTaskRow[]; meta: PagedMeta }
  | { kind: 'risks'; rows: DrillRiskRow[]; meta: PagedMeta }
  | { kind: 'change-requests'; rows: DrillCrRow[]; meta: PagedMeta };

/**
 * Loads one page of the records behind a KPI or chart element. `filters`
 * is the dashboard's current filter query; the request's own params
 * (e.g. drillCategoryId, kind=overdue) narrow it further. `meta.total` is
 * the record count the drawer shows against the clicked figure.
 */
export function useDrillQuery(request: DrillRequest | null, filters: DashboardQuery, page: number) {
  const params = request ? { ...filters, ...request.params, page, pageSize: DRILL_PAGE_SIZE } : {};

  return useQuery({
    queryKey: queryKeys.dashboard.drill(request?.kind ?? 'none', params),
    enabled: request !== null,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DrillResult> => {
      // Narrowed per kind so each call is checked against its own
      // OpenAPI parameters and response schema.
      switch (request!.kind) {
        case 'costs': {
          const { data, error, response } = await api.GET('/dashboard/drill/costs', {
            params: { query: { ...filters, ...request!.params, page, pageSize: DRILL_PAGE_SIZE } },
          });
          if (error) throw toApiError(error, response);
          return { kind: 'costs', rows: data!.data, meta: data!.meta };
        }
        case 'tasks': {
          const { data, error, response } = await api.GET('/dashboard/drill/tasks', {
            params: { query: { ...filters, ...request!.params, page, pageSize: DRILL_PAGE_SIZE } },
          });
          if (error) throw toApiError(error, response);
          return { kind: 'tasks', rows: data!.data, meta: data!.meta };
        }
        case 'risks': {
          const { data, error, response } = await api.GET('/dashboard/drill/risks', {
            params: { query: { ...filters, ...request!.params, page, pageSize: DRILL_PAGE_SIZE } },
          });
          if (error) throw toApiError(error, response);
          return { kind: 'risks', rows: data!.data, meta: data!.meta };
        }
        case 'change-requests': {
          const { data, error, response } = await api.GET('/dashboard/drill/change-requests', {
            params: { query: { ...filters, page, pageSize: DRILL_PAGE_SIZE } },
          });
          if (error) throw toApiError(error, response);
          return { kind: 'change-requests', rows: data!.data, meta: data!.meta };
        }
      }
    },
  });
}
