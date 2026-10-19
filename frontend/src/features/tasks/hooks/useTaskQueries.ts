import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';
import { UNASSIGNED, type TaskListFilters } from '../types';

export const TASK_PAGE_SIZE = 20;
// My tasks groups one page of results into Overdue / Due soon / Upcoming /
// Done; 100 is the backend maximum, so a typical person's whole workload
// fits on a single page and the groups are complete.
export const MY_TASKS_PAGE_SIZE = 100;

type ProjectTasksQuery = NonNullable<paths['/projects/{projectId}/tasks']['get']['parameters']['query']>;

// URL params are strings; the API wants numbers/flags and no empty values.
// The assignee filter's "Unassigned" sentinel becomes `unassigned=true`.
function toTaskListQuery(f: TaskListFilters): ProjectTasksQuery {
  return {
    q: f.q || undefined,
    status: f.status || undefined,
    assigneeId: f.assignee && f.assignee !== UNASSIGNED ? Number(f.assignee) : undefined,
    unassigned: f.assignee === UNASSIGNED ? 'true' : undefined,
    priority: (f.priority || undefined) as ProjectTasksQuery['priority'],
    overdue: f.overdue === 'true' ? 'true' : undefined,
    sort: f.sort as ProjectTasksQuery['sort'],
    order: f.order as ProjectTasksQuery['order'],
    page: Number(f.page) || 1,
    pageSize: TASK_PAGE_SIZE,
  };
}

export function useProjectTasks(projectId: number, filters: TaskListFilters) {
  return useQuery({
    queryKey: queryKeys.tasks.projectList(projectId, filters),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{projectId}/tasks', {
        params: { path: { projectId }, query: toTaskListQuery(filters) },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

// Sorted by due date so each group on My tasks reads soonest-first.
export function useMyTasks(page: number) {
  return useQuery({
    queryKey: queryKeys.tasks.mine({ page }),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/tasks/mine', {
        params: { query: { sort: 'dueDate', order: 'asc', page, pageSize: MY_TASKS_PAGE_SIZE } },
      });
      if (error) throw toApiError(error, response);
      return { rows: data!.data ?? [], total: data!.meta?.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}
