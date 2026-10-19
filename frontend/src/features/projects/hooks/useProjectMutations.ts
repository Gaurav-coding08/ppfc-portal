import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';

export type CreateProjectBody = paths['/projects']['post']['requestBody']['content']['application/json'];
export type UpdateProjectBody =
  paths['/projects/{id}']['patch']['requestBody']['content']['application/json'];
type AddMemberBody = paths['/projects/{id}/members']['post']['requestBody']['content']['application/json'];

// Cache rule (CLAUDE.md): after a mutation, *invalidate* — never patch the
// cached numbers. A project change can move the list row, the detail
// header (progress, delivery status), the activity feed, and dashboard
// figures, so every mutation here invalidates the whole `projects`
// namespace plus `dashboard`. react-query only refetches the queries that
// are currently mounted; the rest are just marked stale.
//
// `auth.me` is included because it carries the caller's memberships, which
// can.ts uses for UI hints: creating a project, transferring ownership or
// changing members can all change them. Without this, a PM who just
// created a project would not see its Edit button (the session query is
// otherwise cached for the whole session).
function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me }),
    ]);
}

export function useCreateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: async (body: CreateProjectBody) => {
      const { data, error, response } = await api.POST('/projects', { body });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

// `body.version` must be the version the form loaded (CLAUDE.md
// "Concurrency"); a stale one comes back as 409 VERSION_CONFLICT and the
// caller shows VersionConflictDialog — this hook never retries.
export function useUpdateProject(id: number) {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: async (body: UpdateProjectBody) => {
      const { data, error, response } = await api.PATCH('/projects/{id}', {
        params: { path: { id } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

// Membership changes also change who a PM can see in `GET /users` (its
// scope is "users on projects I manage"), so the users namespace is
// invalidated along with the project.
export function useAddMember(projectId: number) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: async (body: AddMemberBody) => {
      const { data, error, response } = await api.POST('/projects/{id}/members', {
        params: { path: { id: projectId } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: () =>
      Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: queryKeys.users.all })]),
  });
}

export function useRemoveMember(projectId: number) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: async (userId: number) => {
      const { error, response } = await api.DELETE('/projects/{id}/members/{userId}', {
        params: { path: { id: projectId, userId } },
      });
      if (error) throw toApiError(error, response);
    },
    onSuccess: () =>
      Promise.all([invalidate(), queryClient.invalidateQueries({ queryKey: queryKeys.users.all })]),
  });
}
