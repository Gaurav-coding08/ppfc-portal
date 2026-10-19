import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectDetailPage } from '@/features/projects/pages/ProjectDetailPage';
import { API } from '@/test/handlers';
import { listResponse, risk } from '@/test/fixtures/governance';
import { projectDetail } from '@/test/fixtures/projects';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';

const openRisk = risk({ id: 1, title: 'Vendor delivery slips', version: 3 });
const closedRisk = risk({
  id: 2,
  title: 'Licence renewal',
  status: 'closed',
  closedAt: '2026-06-04T09:00:00.000Z',
});

let patches: unknown[];

beforeEach(() => {
  patches = [];
  server.use(
    http.get(`${API}/projects/1`, () => HttpResponse.json({ data: projectDetail })),
    http.get(`${API}/projects/1/risks`, () => HttpResponse.json(listResponse([openRisk, closedRisk]))),
    http.patch(`${API}/risks/1`, async ({ request }) => {
      patches.push(await request.json());
      return HttpResponse.json({ data: { ...openRisk, status: 'closed', version: 4 } });
    }),
  );
});

function renderRisks() {
  return renderWithProviders(<ProjectDetailPage />, {
    route: '/projects/1?tab=risks',
    path: '/projects/:id',
  });
}

describe('Project Risks tab', () => {
  it('closing a risk asks for confirmation, then PATCHes status with the loaded version', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    renderRisks();

    await user.click(await screen.findByRole('button', { name: 'Close Vendor delivery slips' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('drops out of the high-exposure view');
    expect(patches).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Close risk' }));
    await waitFor(() => expect(patches).toEqual([{ status: 'closed', version: 3 }]));
    // A closed risk offers no Close action.
    expect(screen.queryByRole('button', { name: 'Close Licence renewal' })).not.toBeInTheDocument();
  });

  it('is read-only for a contributor', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderRisks();

    await screen.findByText('Vendor delivery slips');
    expect(screen.queryByRole('button', { name: 'New risk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Close / })).not.toBeInTheDocument();
  });
});
