import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '@/auth/AuthProvider';
import { API } from '@/test/handlers';
import { server } from '@/test/server';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './Sidebar';

function renderSidebarAs(user: { role: string }) {
  server.use(
    http.get(`${API}/auth/me`, () =>
      HttpResponse.json({
        data: {
          user: { id: 6, email: 'estell.conroy@ppfc.demo', fullName: 'Estell Conroy', ...user },
          memberships: [],
        },
      }),
    ),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects']}>
        <AuthProvider>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppSidebar', () => {
  it('hides the Admin nav group for a contributor', async () => {
    renderSidebarAs({ role: 'contributor' });

    // Wait for the session to resolve before asserting on role-gated nav.
    expect(await screen.findByText('Delivery')).toBeInTheDocument();
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.queryByText('Finance')).not.toBeInTheDocument();
  });

  it('shows the Admin nav group for an admin', async () => {
    renderSidebarAs({ role: 'admin' });

    expect(await screen.findByText('Admin')).toBeInTheDocument();
  });
});
