import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';

export type SubmitCrBody =
  paths['/projects/{projectId}/change-requests']['post']['requestBody']['content']['application/json'];
export type DecisionBody =
  paths['/change-requests/{id}/decision']['post']['requestBody']['content']['application/json'];
export type ResubmitBody =
  paths['/change-requests/{id}/resubmit']['post']['requestBody']['content']['application/json'];

// Cache rule (CLAUDE.md): invalidate, never patch the cache. A CR change
// touches:
// - `change-requests` — every list and the detail page (status + history)
// - `projects`        — the header's pending-CR count and the Activity tab
//                       (the backend writes an audit event per decision)
// - `dashboard`       — CR KPIs and drill-downs (M3)
// Approving a CR never changes budget or costs (spec §4), so finance keys
// are deliberately not touched.
export function useInvalidateChangeRequests() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.changeRequests.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ]);
}

export function useSubmitCr(projectId: number) {
  const invalidate = useInvalidateChangeRequests();
  return useMutation({
    mutationFn: async (body: SubmitCrBody) => {
      const { data, error, response } = await api.POST('/projects/{projectId}/change-requests', {
        params: { path: { projectId } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

// `idempotencyKey` is created by the caller when the decision panel
// opens and reused for every retry of that decision, so a double click or
// a retried network call replays the first response instead of deciding
// twice (backend idempotency middleware).
export function useDecideCr(id: number) {
  const invalidate = useInvalidateChangeRequests();
  return useMutation({
    mutationFn: async ({ body, idempotencyKey }: { body: DecisionBody; idempotencyKey: string }) => {
      const { data, error, response } = await api.POST('/change-requests/{id}/decision', {
        // The OpenAPI file declares the header as a required parameter, so
        // openapi-fetch sends it from `params.header`.
        params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

export function useResubmitCr(id: number) {
  const invalidate = useInvalidateChangeRequests();
  return useMutation({
    mutationFn: async (body: ResubmitBody) => {
      const { data, error, response } = await api.POST('/change-requests/{id}/resubmit', {
        params: { path: { id } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}
