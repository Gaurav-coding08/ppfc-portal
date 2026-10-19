import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';

export type CreateRiskBody =
  paths['/projects/{projectId}/risks']['post']['requestBody']['content']['application/json'];
export type UpdateRiskBody = paths['/risks/{id}']['patch']['requestBody']['content']['application/json'];

// Cache rule (CLAUDE.md): invalidate, never patch the cache. A risk change
// touches:
// - `risks`     — the project tab, /risks and the high-exposure view
// - `projects`  — the header's open-risk count and delivery status (an
//                 open high-exposure risk makes a project "at risk")
// - `dashboard` — the risk matrix and KPIs (M3)
export function useInvalidateRisks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.risks.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ]);
}

export function useCreateRisk(projectId: number) {
  const invalidate = useInvalidateRisks();
  return useMutation({
    mutationFn: async (body: CreateRiskBody) => {
      const { data, error, response } = await api.POST('/projects/{projectId}/risks', {
        params: { path: { projectId } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

// `body.version` is the version the form/row was loaded with; a 409 is
// shown to the user, never retried with a fresh version.
export function useUpdateRisk() {
  const invalidate = useInvalidateRisks();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateRiskBody }) => {
      const { data, error, response } = await api.PATCH('/risks/{id}', {
        params: { path: { id } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}
