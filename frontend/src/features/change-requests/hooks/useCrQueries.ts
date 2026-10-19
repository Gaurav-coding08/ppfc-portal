import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { CrListFilters } from '../types';

export const CR_PAGE_SIZE = 20;

// URL params are strings; the API wants numbers/flags and no empty values.
// `status` is passed through as the comma list the backend accepts.
export function useChangeRequests(filters: Partial<CrListFilters>) {
  return useQuery({
    queryKey: queryKeys.changeRequests.list(filters),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/change-requests', {
        params: {
          query: {
            status: filters.status || undefined,
            projectId: filters.projectId ? Number(filters.projectId) : undefined,
            mine: filters.mine === 'true' ? 'true' : undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
            page: Number(filters.page) || 1,
            pageSize: CR_PAGE_SIZE,
          },
        },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

/** One CR with its full status history (oldest first, as the API returns it). */
export function useChangeRequest(id: number) {
  return useQuery({
    queryKey: queryKeys.changeRequests.detail(id),
    enabled: Number.isInteger(id) && id > 0,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/change-requests/{id}', {
        params: { path: { id } },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
  });
}
