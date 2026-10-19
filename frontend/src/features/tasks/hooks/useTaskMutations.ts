import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';

export type CreateTaskBody =
  paths['/projects/{projectId}/tasks']['post']['requestBody']['content']['application/json'];
export type UpdateTaskBody = paths['/tasks/{id}']['patch']['requestBody']['content']['application/json'];

// Cache rule (CLAUDE.md): invalidate, never patch numbers in the cache.
// A task change moves more than the task row:
// - `tasks`     — the project Tasks tab and My tasks lists
// - `projects`  — the detail header's weighted progress, delivery status
//                 and overdue count, and the list's progress column, all
//                 recomputed by the backend (fn_project_progress)
// - `dashboard` — portfolio KPIs and overdue widgets (M3) read the same data
// Only mounted queries refetch; the rest are marked stale for next time.
export function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ]);
}

export function useCreateTask(projectId: number) {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (body: CreateTaskBody) => {
      const { data, error, response } = await api.POST('/projects/{projectId}/tasks', {
        params: { path: { projectId } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

// `id` is passed per call (not per hook) because My tasks updates many
// different rows through one hook instance. `body.version` must be the
// version the row/form was loaded with; a 409 is shown to the user, never
// retried with a fresh version.
export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateTaskBody }) => {
      const { data, error, response } = await api.PATCH('/tasks/{id}', {
        params: { path: { id } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error, response } = await api.DELETE('/tasks/{id}', { params: { path: { id } } });
      if (error) throw toApiError(error, response);
    },
    onSuccess: invalidate,
  });
}
