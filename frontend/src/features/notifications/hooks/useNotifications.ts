import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';

export const BELL_LIMIT = 8;
export const NOTIFICATION_PAGE_SIZE = 20;
// Feature 18 spec: the bell polls every 60 s (and React Query's default
// refetchOnWindowFocus refetches when the tab regains focus).
export const BELL_POLL_MS = 60_000;

async function fetchNotifications(query: { unread?: boolean; page: number; pageSize: number }) {
  const { data, error, response } = await api.GET('/notifications', {
    // The backend coerces any `unread` value (even "false") to true, so
    // the param is only sent when filtering.
    params: { query: { unread: query.unread || undefined, page: query.page, pageSize: query.pageSize } },
  });
  if (error) throw toApiError(error, response);
  return { rows: data!.data ?? [], total: data!.meta?.total ?? 0, unreadCount: data!.unreadCount ?? 0 };
}

/** Latest few for the topbar dropdown; `unreadCount` is the server's total. */
export function useBellNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.list({ bell: true }),
    queryFn: () => fetchNotifications({ page: 1, pageSize: BELL_LIMIT }),
    refetchInterval: BELL_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationsPage(filters: { unread: string; page: string }) {
  return useQuery({
    queryKey: queryKeys.notifications.list(filters),
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchNotifications({
        unread: filters.unread === 'true',
        page: Number(filters.page) || 1,
        pageSize: NOTIFICATION_PAGE_SIZE,
      }),
  });
}

// After marking read, every notifications query refetches, so the bell's
// count is whatever the server now reports — never a local decrement.
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data, error, response } = await api.PATCH('/notifications/{id}/read', {
        params: { path: { id } },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}
