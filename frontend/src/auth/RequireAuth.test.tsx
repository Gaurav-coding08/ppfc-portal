import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';

function renderProtectedApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
            <Route element={<RequireAuth />}>
              <Route path="/projects" element={<div>Projects page</div>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequireAuth', () => {
  it('redirects to /login when GET /auth/me returns 401 (not logged in)', async () => {
    // The default msw handler (src/test/handlers.ts) returns 401 for
    // `/auth/me`, matching "not logged in" on first load.
    renderProtectedApp();

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Projects page')).not.toBeInTheDocument();
  });
});
