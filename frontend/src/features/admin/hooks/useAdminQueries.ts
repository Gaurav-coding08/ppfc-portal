import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { AuditListFilters, Role, UserListFilters } from '../types';

export const ADMIN_PAGE_SIZE = 20;

type UserSort = 'fullName' | 'email' | 'role' | 'createdAt';

// `GET /users` returns everyone for an admin (a PM would get a scoped
// subset, but this page is admin-only).
export function useAdminUsers(filters: UserListFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.users(filters),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/users', {
        params: {
          query: {
            q: filters.q || undefined,
            role: (filters.role as Role) || undefined,
            departmentId: filters.departmentId ? Number(filters.departmentId) : undefined,
            sort: filters.sort as UserSort,
            order: filters.order as 'asc' | 'desc',
            page: Number(filters.page) || 1,
            pageSize: ADMIN_PAGE_SIZE,
          },
        },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
  });
}

/** Every user (id → name) for the audit log's actor filter; 100 is the API max. */
export function useActorOptions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.users({ options: true }),
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/users', {
        params: { query: { pageSize: 100, sort: 'fullName', order: 'asc' } },
      });
      if (error) throw toApiError(error, response);
      return (data!.data ?? []).map((u) => ({ value: String(u.id), label: u.fullName ?? '' }));
    },
  });
}

export function useAuditEvents(filters: AuditListFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.audit(filters),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/admin/audit-events', {
        params: {
          query: {
            entityType: filters.entityType || undefined,
            actorId: filters.actorId ? Number(filters.actorId) : undefined,
            from: filters.from || undefined,
            to: filters.to || undefined,
            page: Number(filters.page) || 1,
            pageSize: ADMIN_PAGE_SIZE,
          },
        },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
  });
}
