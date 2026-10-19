import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';

export type CreateMilestoneBody =
  paths['/projects/{projectId}/milestones']['post']['requestBody']['content']['application/json'];
export type UpdateMilestoneBody =
  paths['/milestones/{id}']['patch']['requestBody']['content']['application/json'];

// The backend returns every milestone of a project in one response (no
// pagination — a project has a handful), ordered by due date.
export function useProjectMilestones(projectId: number) {
  return useQuery({
    queryKey: queryKeys.milestones.projectList(projectId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/projects/{projectId}/milestones', {
        params: { path: { projectId } },
      });
      if (error) throw toApiError(error, response);
      return data!.data ?? [];
    },
  });
}

// A milestone change can move the project's delivery status (a missed or
// overdue milestone makes it "at risk" — fn_project_delivery_status) and
// the dashboard's upcoming-milestones widget, so both namespaces are
// invalidated along with the milestone list. Never patched in the cache.
function useInvalidateMilestones() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.milestones.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ]);
}

export function useCreateMilestone(projectId: number) {
  const invalidate = useInvalidateMilestones();
  return useMutation({
    mutationFn: async (body: CreateMilestoneBody) => {
      const { data, error, response } = await api.POST('/projects/{projectId}/milestones', {
        params: { path: { projectId } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

// `body.version` is the version the form loaded; a 409 is shown, never retried.
export function useUpdateMilestone() {
  const invalidate = useInvalidateMilestones();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateMilestoneBody }) => {
      const { data, error, response } = await api.PATCH('/milestones/{id}', {
        params: { path: { id } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}
