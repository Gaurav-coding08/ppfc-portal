import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, type ReactNode } from 'react';
import { api } from '@/api/client';
import { toApiError } from '@/api/errors';
import * as queryKeys from '@/api/queryKeys';
import { AuthContext, type AuthContextValue } from './authContext';
import type { AuthUser, Membership } from './types';

interface Session {
  user: AuthUser;
  memberships: Membership[];
}

// A 401 here means "not logged in yet" — the normal state on first load,
// not a failure to surface, so the query resolves to `null` instead of an
// error. Any other status is a real error (network, 500) and is thrown so
// react-query's retry/error state applies.
async function fetchSession(): Promise<Session | null> {
  const { data, error, response } = await api.GET('/auth/me');
  if (error) {
    if (response.status === 401) return null;
    throw toApiError(error, response);
  }
  return { user: data!.data!.user!, memberships: data!.data!.memberships ?? [] };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: fetchSession,
    retry: false,
    staleTime: Infinity,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const { error, response } = await api.POST('/auth/login', {
        body: { email, password },
      });
      if (error) throw toApiError(error, response);
      // The login response doesn't include memberships, so refetch /auth/me
      // rather than hand-building the session from the login payload.
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await api.POST('/auth/logout');
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data?.user ?? null,
      memberships: sessionQuery.data?.memberships ?? [],
      isLoading: sessionQuery.isPending,
      login,
      logout,
    }),
    [sessionQuery.data, sessionQuery.isPending, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
