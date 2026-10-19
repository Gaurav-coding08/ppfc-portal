import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { projectDetail } from '@/test/fixtures/projects';
import { milestone } from '@/test/fixtures/tasks';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { MilestonesTab } from './MilestonesTab';

let posted: unknown;

beforeEach(() => {
  posted = undefined;
  server.use(
    http.get(`${API}/projects/1/milestones`, () =>
      HttpResponse.json({
        data: [
          milestone({
            id: 1,
            name: 'Requirements sign-off',
            dueDate: '2026-03-14',
            status: 'achieved',
            achievedDate: '2026-03-14',
            daysToDue: -200,
          }),
          milestone({ id: 2, name: 'Pilot launch', dueDate: '2026-10-09', daysToDue: 9 }),
          milestone({
            id: 3,
            name: 'Security review',
            dueDate: '2026-09-15',
            isOverdue: true,
            daysToDue: -15,
          }),
          milestone({ id: 4, name: 'Go-live', dueDate: '2027-03-31', daysToDue: 182 }),
        ],
      }),
    ),
    http.post(`${API}/projects/1/milestones`, async ({ request }) => {
      posted = await request.json();
      return HttpResponse.json({ data: milestone({ id: 5 }) }, { status: 201 });
    }),
  );
});

describe('MilestonesTab', () => {
  it('highlights a planned milestone due within 14 days and flags an overdue one', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderWithProviders(<MilestonesTab project={projectDetail} canManage={false} />);

    const pilot = (await screen.findAllByText('Pilot launch')).find((el) => el.closest('tr'))!.closest('tr')!;
    expect(pilot).toHaveTextContent('Due in 9 days');
    expect(pilot.className).toContain('bg-amber-50');
    const goLive = screen
      .getAllByText('Go-live')
      .find((el) => el.closest('tr'))!
      .closest('tr')!;
    expect(goLive).not.toHaveTextContent('Due in');
    const review = screen
      .getAllByText('Security review')
      .find((el) => el.closest('tr'))!
      .closest('tr')!;
    expect(review).toHaveTextContent('Overdue');
    // Read-only for a contributor.
    expect(screen.queryByRole('button', { name: 'New milestone' })).not.toBeInTheDocument();
  });

  it('requires an achieved date for an achieved milestone and a due date within the project', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    renderWithProviders(<MilestonesTab project={projectDetail} canManage />);

    await user.click(await screen.findByRole('button', { name: 'New milestone' }));
    await user.type(await screen.findByLabelText(/^Name/), 'UAT complete');
    await user.type(screen.getByLabelText(/^Due date/), '2027-05-01');
    await user.click(screen.getByLabelText(/^Status/));
    await user.click(await screen.findByRole('option', { name: 'Achieved' }));
    await user.click(screen.getByRole('button', { name: 'Create milestone' }));

    expect(await screen.findByText('Due date must fall within the project dates')).toBeInTheDocument();
    expect(screen.getByText('An achieved milestone needs an achieved date')).toBeInTheDocument();
    expect(posted).toBeUndefined();

    const due = screen.getByLabelText(/^Due date/);
    await user.clear(due);
    await user.type(due, '2026-09-20');
    await user.type(screen.getByLabelText(/^Achieved date/), '2026-09-22');
    await user.click(screen.getByRole('button', { name: 'Create milestone' }));

    await waitFor(() =>
      expect(posted).toEqual({
        name: 'UAT complete',
        dueDate: '2026-09-20',
        status: 'achieved',
        achievedDate: '2026-09-22',
      }),
    );
  });
});
