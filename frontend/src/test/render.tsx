import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { LocationProbe } from './LocationProbe';

// A fresh QueryClient per render (not the app's singleton from
// app/queryClient.ts) so one test's cache never leaks into another's.
// `retry: false` keeps a failing query's test fast instead of waiting out
// react-query's backoff.
//
// `path`: mount `ui` under a <Route path=...> so `useParams()` works (e.g.
// `path: '/projects/:id'` with `route: '/projects/1'`).
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path }: { route?: string; path?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          {path ? (
            <Routes>
              <Route path={path} element={ui} />
              <Route path="*" element={null} />
            </Routes>
          ) : (
            ui
          )}
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}
