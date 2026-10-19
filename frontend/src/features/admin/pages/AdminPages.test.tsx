import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { Toaster } from 'sonner';
import { describe, expect, it } from 'vitest';
import { AutomationPage } from '@/features/automation/pages/AutomationPage';
import { adminUser, auditEvent, departmentsHandler } from '@/test/fixtures/admin';
import { listResponse } from '@/test/fixtures/governance';
import { API } from '@/test/handlers';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { AuditLogPage } from './AuditLogPage';
import { UsersPage } from './UsersPage';

function renderUsersPage() {
  return renderWithProviders(
    <>
      <UsersPage />
      <Toaster />
    </>,
    { route: '/admin/users' },
  );
}

describe('admin pages for a non-admin', () => {
  it('shows ForbiddenState on a direct URL and never calls the admin endpoints', async () => {
    const called: string[] = [];
    server.use(
      departmentsHandler,
      http.get(`${API}/users`, () => {
        called.push('users');
        return HttpResponse.json(listResponse([]));
      }),
      http.get(`${API}/admin/audit-events`, () => {
        called.push('audit');
        return HttpResponse.json(listResponse([]));
      }),
      http.get(`${API}/admin/automation/runs`, () => {
        called.push('runs');
        return HttpResponse.json(listResponse([]));
      }),
    );
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);

    const { unmount } = renderWithProviders(<UsersPage />, { route: '/admin/users' });
    expect(await screen.findByText('Only admins can manage users.')).toBeInTheDocument();
    unmount();

    renderWithProviders(<AuditLogPage />, { route: '/admin/audit-log' });
    expect(await screen.findByText('Only admins can review the audit log.')).toBeInTheDocument();

    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderWithProviders(<AutomationPage />, { route: '/admin/automation' });
    expect(await screen.findByText('Only admins can manage automation.')).toBeInTheDocument();

    expect(called).toEqual([]);
  });
});

describe('Users page (admin)', () => {
  it('changes a role only after the confirmation dialog, sending the loaded version', async () => {
    const user = userEvent.setup();
    const patches: unknown[] = [];
    mockSession('admin');
    server.use(
      departmentsHandler,
      http.get(`${API}/users`, () => HttpResponse.json(listResponse([adminUser({ version: 4 })]))),
      http.patch(`${API}/admin/users/12`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ data: adminUser({ role: 'project_manager', version: 5 }) });
      }),
    );
    renderUsersPage();

    await user.click(await screen.findByRole('button', { name: 'Change role' }));
    const pick = await screen.findByRole('dialog');
    await user.click(within(pick).getByLabelText('New role'));
    await user.click(await screen.findByRole('option', { name: 'Project manager' }));
    await user.click(within(pick).getByRole('button', { name: 'Continue' }));

    // The consequence is stated and nothing has been sent yet.
    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Make Adaline Bahringer Project manager?')).toBeInTheDocument();
    expect(patches).toEqual([]);

    await user.click(within(confirm).getByRole('button', { name: 'Change role' }));
    await waitFor(() => expect(patches).toEqual([{ role: 'project_manager', version: 4 }]));
    expect(await screen.findByText('Adaline Bahringer is now Project manager')).toBeInTheDocument();
  });

  it("shows the backend's message when an admin tries to change their own role", async () => {
    const user = userEvent.setup();
    mockSession('admin');
    const me = adminUser({ id: 1, fullName: 'Garnet Wiegand', role: 'admin', departmentId: 3 });
    server.use(
      departmentsHandler,
      http.get(`${API}/users`, () => HttpResponse.json(listResponse([me]))),
      http.patch(`${API}/admin/users/1`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'BUSINESS_RULE',
              message: 'Admins cannot change their own role',
              requestId: 'req-self-1',
            },
          },
          { status: 422 },
        ),
      ),
    );
    renderUsersPage();

    expect(await screen.findByText('(you)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change role' }));
    await user.click(within(await screen.findByRole('dialog')).getByLabelText('New role'));
    await user.click(await screen.findByRole('option', { name: 'Contributor' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Change role' }),
    );

    const alert = await within(await screen.findByRole('dialog')).findByRole('alert');
    expect(alert).toHaveTextContent('Admins cannot change their own role');
    expect(alert).toHaveTextContent('Request ID: req-self-1');
  });
});

describe('Audit log page (admin)', () => {
  it('passes URL filters to the API and expands a row into a field-level diff', async () => {
    const user = userEvent.setup();
    const queries: URLSearchParams[] = [];
    mockSession('admin');
    server.use(
      http.get(`${API}/users`, () => HttpResponse.json(listResponse([adminUser()]))),
      http.get(`${API}/admin/audit-events`, ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json(listResponse([auditEvent()]));
      }),
    );
    renderWithProviders(<AuditLogPage />, { route: '/admin/audit-log?entityType=task&from=2026-10-01' });

    const link = await screen.findByRole('link', { name: 'task #75' });
    expect(link).toHaveAttribute('href', '/projects/7?tab=tasks');
    expect(queries[0].get('entityType')).toBe('task');
    expect(queries[0].get('from')).toBe('2026-10-01');

    const toggle = screen.getByRole('button', { name: /Show changes for task.update/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    const diff = await screen.findByRole('table', { name: 'Before and after' });
    const progressRow = within(diff).getByText('progress').closest('tr')!;
    expect(progressRow).toHaveTextContent('(changed)');
    expect(progressRow).toHaveTextContent('20');
    expect(progressRow).toHaveTextContent('60');
    expect(within(diff).getByText('status').closest('tr')).not.toHaveTextContent('(changed)');
  });
});
