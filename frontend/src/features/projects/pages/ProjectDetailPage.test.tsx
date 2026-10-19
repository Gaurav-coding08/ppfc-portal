import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { departmentsResponse, projectDetail } from '@/test/fixtures/projects';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { ProjectDetailPage } from './ProjectDetailPage';

let detailCalls: number;

beforeEach(() => {
  detailCalls = 0;
  server.use(
    http.get(`${API}/projects/1`, () => {
      detailCalls += 1;
      return HttpResponse.json({ data: projectDetail });
    }),
    http.get(`${API}/projects/1/progress-snapshots`, () =>
      HttpResponse.json({
        data: [{ snapshotDate: '2026-08-31', progressPct: 40, actualSpend: 100000 }],
        meta: { page: 1, pageSize: 100, total: 1 },
      }),
    ),
    http.get(`${API}/departments`, () => HttpResponse.json(departmentsResponse)),
    http.get(`${API}/users`, () =>
      HttpResponse.json({ data: [], meta: { page: 1, pageSize: 100, total: 0 } }),
    ),
  );
});

function renderDetail(route = '/projects/1') {
  return renderWithProviders(<ProjectDetailPage />, { route, path: '/projects/:id' });
}

describe('ProjectDetailPage', () => {
  it('shows a friendly not-found message when the backend answers 404 (missing or out of scope)', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    server.use(
      http.get(`${API}/projects/99`, () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'req-404' } },
          { status: 404 },
        ),
      ),
    );
    renderDetail('/projects/99');
    expect(await screen.findByText("Project not found or you don't have access.")).toBeInTheDocument();
  });

  it('renders the header card and overview figures exactly as the API returns them', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderDetail();
    expect(
      await screen.findByRole('heading', { name: 'Digital Platforms Modernization' }),
    ).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
    expect(screen.getByText('5 Jan 2026')).toBeInTheDocument();
    // utilization 0.6818 is a ratio → displayed as 68 %, not 0.68 %.
    expect(screen.getByText('68%')).toBeInTheDocument();
  });

  it('hides Edit and member management from a contributor', async () => {
    const user = userEvent.setup();
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderDetail('/projects/1?tab=members');

    expect(await screen.findByText('estell.conroy@ppfc.demo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add member/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();

    // Switching tabs writes `?tab=` to the URL.
    await user.click(screen.getByRole('tab', { name: 'Overview' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/projects\/1$/));
  });

  it('removes a member after confirmation and refetches the project', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    let deleted: string | undefined;
    server.use(
      http.delete(`${API}/projects/1/members/:userId`, ({ params }) => {
        deleted = String(params.userId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDetail('/projects/1?tab=members');

    // The owner row has no remove button (backend never allows it).
    await screen.findByText('estell.conroy@ppfc.demo');
    expect(screen.queryByRole('button', { name: 'Remove Christelle Satterfield' })).not.toBeInTheDocument();

    const callsBefore = detailCalls;
    await user.click(screen.getByRole('button', { name: 'Remove Estell Conroy' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('will lose access to PRJ-001');
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(deleted).toBe('6'));
    // Invalidation (not cache patching) → the detail query refetched.
    await waitFor(() => expect(detailCalls).toBeGreaterThan(callsBefore));
  });

  it('opens the version-conflict dialog when an edit comes back 409, sending the loaded version', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    let patchBody: Record<string, unknown> | undefined;
    server.use(
      http.patch(`${API}/projects/1`, async ({ request }) => {
        patchBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            error: {
              code: 'VERSION_CONFLICT',
              message: 'Record was modified by someone else',
              details: { currentVersion: 4 },
              requestId: 'req-409',
            },
          },
          { status: 409 },
        );
      }),
    );
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, 'Digital Platforms Modernisation');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('This record was changed by someone else')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(patchBody).toMatchObject({ name: 'Digital Platforms Modernisation', version: 3 });
    // Strict PATCH schema: the budget must never be sent on edit.
    expect(patchBody).not.toHaveProperty('initialBudget');
  });
});
