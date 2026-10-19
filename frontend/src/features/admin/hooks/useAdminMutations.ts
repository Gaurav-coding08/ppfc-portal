import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import type { paths } from '@/api/schema';

type CreateUserBody = paths['/admin/users']['post']['requestBody']['content']['application/json'];
type UpdateUserBody = paths['/admin/users/{id}']['patch']['requestBody']['content']['application/json'];

// A user change can affect every user picker (owners, members) and the
// audit log, so the admin namespace and the shared `users` directory are
// both invalidated; `auth.me` too, in case an admin edits their own name.
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me }),
    ]);
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async (body: CreateUserBody) => {
      const { data, error, response } = await api.POST('/admin/users', { body });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}

/** PATCH with the `version` the row was loaded with (409 on mismatch). */
export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateUserBody }) => {
      const { data, error, response } = await api.PATCH('/admin/users/{id}', {
        params: { path: { id } },
        body,
      });
      if (error) throw toApiError(error, response);
      return data!.data!;
    },
    onSuccess: invalidate,
  });
}
