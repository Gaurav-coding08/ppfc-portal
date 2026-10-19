import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { SelectOption } from '@/components/form/SelectField';

// Option lists for project forms and filters. Reference data changes
// rarely, so these keep the default 30 s staleTime and are shared across
// every screen that asks for the same key.

export function useDepartmentOptions() {
  return useQuery({
    queryKey: queryKeys.departments.list(),
    queryFn: async (): Promise<SelectOption[]> => {
      const { data, error, response } = await api.GET('/departments');
      if (error) throw toApiError(error, response);
      return (data!.data ?? []).map((d) => ({ value: String(d.id), label: d.name ?? '' }));
    },
  });
}

// `GET /dashboard/filters` is the only option list every role may call
// (`GET /users` is PM/admin only), and its `managers` list is exactly
// "owners of the projects you can see" — what an owner filter needs. Its
// `projects` list ("PRJ-001 — Name", scoped the same way) labels the
// project column on the risk and change-request lists, whose rows carry
// only a projectId.
export function useProjectFilterOptions() {
  return useQuery({
    queryKey: queryKeys.dashboard.filters(),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/dashboard/filters');
      if (error) throw toApiError(error, response);
      const toOptions = (list?: { id?: number; label?: string }[]): SelectOption[] =>
        (list ?? []).map((o) => ({ value: String(o.id), label: o.label ?? '' }));
      return {
        departments: toOptions(data!.data?.departments),
        owners: toOptions(data!.data?.managers),
        projects: toOptions(data!.data?.projects),
      };
    },
  });
}

// Users the caller may pick from the directory (`GET /users`): admin sees
// everyone, a PM only users on projects they manage (backend scope).
// `pageSize: 100` is the backend maximum; the seeded directory is far
// smaller than that. Inactive users are filtered out because the backend
// rejects them as owners/members anyway.
function useDirectory(role: 'project_manager' | 'admin' | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.users.list({ role, pageSize: 100 }),
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/users', {
        params: { query: { role, pageSize: 100 } },
      });
      if (error) throw toApiError(error, response);
      return (data!.data ?? []).filter((u) => u.isActive !== false);
    },
  });
}

/** Eligible owners: active project managers and admins (backend's isEligibleOwner rule). */
export function useOwnerOptions(enabled: boolean) {
  const pms = useDirectory('project_manager', enabled);
  const admins = useDirectory('admin', enabled);
  const options: SelectOption[] = [...(pms.data ?? []), ...(admins.data ?? [])].map((u) => ({
    value: String(u.id),
    label: u.fullName ?? u.email ?? `User ${u.id}`,
  }));
  return { options, isLoading: pms.isLoading || admins.isLoading };
}

/** Every active user in the caller's directory scope — candidates for project membership. */
export function useMemberCandidates(enabled: boolean) {
  return useDirectory(undefined, enabled);
}

/**
 * `projectId → "PRJ-001 — Name"` for lists whose rows carry only an id
 * (risks, change requests). Falls back to "Project #id" while the options
 * load or for a project outside the caller's option list.
 */
export function useProjectLabel() {
  const options = useProjectFilterOptions();
  const projects = options.data?.projects;
  return useCallback(
    (projectId: number) =>
      projects?.find((p) => p.value === String(projectId))?.label ?? `Project #${projectId}`,
    [projects],
  );
}
