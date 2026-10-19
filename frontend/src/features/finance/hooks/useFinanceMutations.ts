import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { CreateCostBody, CreateRevisionBody, UpdateCostBody } from '../schemas';

// Cache rule (CLAUDE.md): invalidate, never patch. The summary numbers are
// never updated locally — not even from the `financials` that
// POST /costs/:id/post returns — because only a refetch is guaranteed to
// use the same asOf and the same SQL as every other screen. Any finance
// write touches:
// - `finance`   — summary, budget, costs, forecasts, alerts, comparison
// - `projects`  — the Overview tab's budget headline and the Activity tab
//                 (each write is audited)
// - `dashboard` — portfolio KPIs (M3)
export function useInvalidateFinance() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ]);
}

export function useCreateCost(projectId: number) {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async (body: CreateCostBody) => {
      const { data, error, response } = await api.POST('/projects/{projectId}/costs', {
        params: { path: { projectId } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

/** Drafts only — the backend refuses edits to posted costs. */
export function useUpdateCost() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateCostBody }) => {
      const { data, error, response } = await api.PATCH('/costs/{id}', { params: { path: { id } }, body });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCost() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error, response } = await api.DELETE('/costs/{id}', { params: { path: { id } } });
      if (error) throw toApiError(error, response);
    },
    onSuccess: invalidate,
  });
}

// `idempotencyKey` is created when the Post confirmation opens and reused
// for any retry from that dialog, so a double click or a retried request
// replays the first response instead of posting twice.
export function usePostCost() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({ id, idempotencyKey }: { id: number; idempotencyKey: string }) => {
      const { data, error, response } = await api.POST('/costs/{id}/post', {
        params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

/** Adds a posted reversal entry; the original posted cost is never changed. */
export function useReverseCost() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const { data, error, response } = await api.POST('/costs/{id}/reverse', {
        params: { path: { id } },
        body: { reason },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

export function useRequestRevision(projectId: number) {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async (body: CreateRevisionBody) => {
      const { data, error, response } = await api.POST('/projects/{projectId}/budget-revisions', {
        params: { path: { projectId } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

// Revisions have no version column (the backend guards on status =
// 'pending'), but the decision schema still requires `version >= 1`, so 1
// is sent. A stale decision comes back as 422 INVALID_TRANSITION.
export function useDecideRevision() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
      reason,
      idempotencyKey,
    }: {
      id: number;
      decision: 'approve' | 'reject';
      reason: string;
      idempotencyKey: string;
    }) => {
      const { data, error, response } = await api.POST('/budget-revisions/{id}/decision', {
        params: { path: { id }, header: { 'Idempotency-Key': idempotencyKey } },
        body: { decision, reason, version: 1 },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

// PUT upserts every month in one request (one audit row). The backend
// doesn't run idempotency middleware on this route — a repeated PUT of
// the same months is naturally idempotent — but the key is still sent so
// every consequential finance write follows the same CLAUDE.md rule.
export function useSaveForecasts(projectId: number) {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({
      months,
      idempotencyKey,
    }: {
      months: { month: string; amount: number }[];
      idempotencyKey: string;
    }) => {
      const { data, error, response } = await api.PUT('/projects/{projectId}/forecasts', {
        params: { path: { projectId } },
        headers: { 'Idempotency-Key': idempotencyKey },
        body: { months },
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

export function useCreateCategory() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async (body: { code: string; name: string }) => {
      const { data, error, response } = await api.POST('/cost-categories', { body });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: number;
      body: { code?: string; name?: string; isActive?: boolean };
    }) => {
      const { data, error, response } = await api.PATCH('/cost-categories/{id}', {
        params: { path: { id } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}
