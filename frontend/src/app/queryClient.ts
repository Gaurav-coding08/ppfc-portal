import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';

// A module-level singleton (not created inside a component) because
// `src/api/client.ts`'s 401 middleware needs to call `queryClient.clear()`
// without importing React or going through context.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  if (error instanceof ApiError) return error.status >= 500;
  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});
