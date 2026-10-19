import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';
import type { ProjectListFilters } from '../types';

export const PROJECT_PAGE_SIZE = 20;

type ListQuery = NonNullable<paths['/projects']['get']['parameters']['query']>;

// URL params are strings; the API wants numbers for ids/page and omits
// anything that isn't set. Empty strings are dropped rather than sent as
// `?departmentId=` (which the backend would reject as not a number).
function toListQuery(f: ProjectListFilters): ListQuery {
  return {
    q: f.q || undefined,
    departmentId: f.departmentId ? Number(f.departmentId) : undefined,
    ownerId: f.ownerId ? Number(f.ownerId) : undefined,
    status: f.status || undefined,
    startFrom: f.startFrom || undefined,
    endTo: f.endTo || undefined,
    sort: f.sort as ListQuery['sort'],
    order: f.order as ListQuery['order'],
    page: Number(f.page) || 1,
    pageSize: PROJECT_PAGE_SIZE,
  };
}

export function useProjectsList(filters: ProjectListFilters) {
  return useQuery({
    queryKey: queryKeys.projects.list(filters),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects', {
        params: { query: toListQuery(filters) },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    // Keep the previous page on screen while the next page/filter loads,
    // instead of flashing the skeleton on every click.
    placeholderData: keepPreviousData,
  });
}

export function useProjectDetail(id: number) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{id}', {
        params: { path: { id } },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
  });
}

// The backend paginates snapshots (max 100 per page); a project has one
// per month, so a single page of 100 covers more than eight years.
export function useProgressSnapshots(id: number) {
  return useQuery({
    queryKey: queryKeys.projects.progressSnapshots(id),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{id}/progress-snapshots', {
        params: { path: { id }, query: { pageSize: 100 } },
      });
      if (error) throw toApiError(error, response);
      return data!.data ?? [];
    },
  });
}

export function useProjectActivity(projectId: number, page: number) {
  return useQuery({
    queryKey: queryKeys.projects.activity(projectId, { page }),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{projectId}/activity', {
        params: { path: { projectId }, query: { page, pageSize: PROJECT_PAGE_SIZE } },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}
