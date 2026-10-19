import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { AutomationListFilters } from '../types';

export const AUTOMATION_PAGE_SIZE = 20;

export function useAutomationRuns(filters: AutomationListFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.automation.runs({ page: filters.page }),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/admin/automation/runs', {
        params: { query: { page: Number(filters.page) || 1, pageSize: AUTOMATION_PAGE_SIZE } },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
  });
}

export function useOutboxEvents(filters: AutomationListFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.automation.outbox({ status: filters.status, page: filters.page }),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/admin/automation/outbox', {
        params: {
          query: {
            status: (filters.status as 'pending' | 'sent' | 'failed') || undefined,
            page: Number(filters.page) || 1,
            pageSize: AUTOMATION_PAGE_SIZE,
          },
        },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
  });
}

// A run writes automation_runs, outbox and notifications rows plus an
// audit event, so all four views are refetched from the server afterwards.
function useInvalidateAutomation() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.automation.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
    ]);
}

/** Manual overdue-escalation pass: producer + dispatcher, returns their counts. */
export function useRunEscalation() {
  const invalidate = useInvalidateAutomation();
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/admin/automation/overdue-escalation/run');
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

/** failed → pending; the next dispatcher pass (scheduled or Run now) delivers it. */
export function useRetryOutboxEvent() {
  const invalidate = useInvalidateAutomation();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error, response } = await api.POST('/admin/automation/outbox/{id}/retry', {
        params: { path: { id } },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}
