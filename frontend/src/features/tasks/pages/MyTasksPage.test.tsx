import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { taskListResponse, taskRow } from '@/test/fixtures/tasks';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { MyTasksPage } from './MyTasksPage';

let mineCalls: number;
const initialRows = [
  taskRow({ id: 1, title: 'Late task', isOverdue: true, dueDate: '2026-09-01' }),
  taskRow({ id: 2, title: 'Soon task', isDueSoon: true, dueDate: '2026-10-05', progress: 20, version: 7 }),
  taskRow({ id: 3, title: 'Later task', dueDate: '2026-12-01' }),
  taskRow({ id: 4, title: 'Finished task', status: 'done', progress: 100, projectId: 8 }),
];
// What the fake backend currently holds; a PATCH handler may replace it.
let rows = initialRows;

beforeEach(() => {
  mineCalls = 0;
  rows = initialRows;
  server.use(
    http.get(`${API}/tasks/mine`, () => {
      mineCalls += 1;
      return HttpResponse.json(taskListResponse(rows));
    }),
  );
  mockSession('contributor', [
    { projectId: 1, memberRole: 'contributor' },
    { projectId: 8, memberRole: 'contributor' },
  ]);
});

function group(title: string) {
  return screen.getByRole('region', { name: new RegExp(`^${title}`) });
}

describe('MyTasksPage', () => {
  it('groups tasks by the API flags into Overdue / Due soon / Upcoming / Done', async () => {
    renderWithProviders(<MyTasksPage />, { route: '/my-tasks' });

    await screen.findByText('Late task');
    expect(within(group('Overdue')).getByText('Late task')).toBeInTheDocument();
    expect(within(group('Due soon')).getByText('Soon task')).toBeInTheDocument();
    expect(within(group('Upcoming')).getByText('Later task')).toBeInTheDocument();
    expect(within(group('Done')).getByText('Finished task')).toBeInTheDocument();
  });

  it('saves inline progress with the loaded version and refetches the list', async () => {
    const user = userEvent.setup();
    let patched: unknown;
    server.use(
      http.patch(`${API}/tasks/2`, async ({ request }) => {
        patched = await request.json();
        rows = rows.map((r) => (r.id === 2 ? { ...r, progress: 75, version: 8 } : r));
        return HttpResponse.json({ data: rows[1] });
      }),
    );
    renderWithProviders(<MyTasksPage />, { route: '/my-tasks' });

    const input = await screen.findByRole('spinbutton', { name: 'Progress for Soon task' });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '75');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(mineCalls).toBe(2));
    expect(patched).toEqual({ progress: 75, version: 7 });
    // The refetched row shows the API's value and the Save button is gone.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument());
    expect(screen.getByRole('spinbutton', { name: 'Progress for Soon task' })).toHaveValue(75);
  });
});
