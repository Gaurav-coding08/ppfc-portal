import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectDetailPage } from '@/features/projects/pages/ProjectDetailPage';
import { API } from '@/test/handlers';
import { projectDetail } from '@/test/fixtures/projects';
import { taskListResponse, taskRow } from '@/test/fixtures/tasks';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';

// Estell (id 6, contributor) owns task 1; task 2 belongs to someone else.
// Task 3 is due exactly on the 2026-09-30 reporting date, which the API
// reports as not overdue; task 2 is past due and reported overdue.
const ownTask = taskRow({ id: 1, title: 'Own task', assigneeId: 6, progress: 40, version: 3 });
const othersTask = taskRow({
  id: 2,
  title: 'Overdue task',
  assigneeId: 8,
  assigneeName: 'Anabelle Reichert-Sipes',
  status: 'blocked',
  dueDate: '2026-09-12',
  isOverdue: true,
});
const dueOnReportingDate = taskRow({
  id: 3,
  title: 'Due on reporting date',
  assigneeId: null,
  assigneeName: null,
  status: 'todo',
  progress: 0,
  dueDate: '2026-09-30',
  isOverdue: false,
  isDueSoon: true,
});

let detailCalls: number;
let taskQueries: URLSearchParams[];

beforeEach(() => {
  detailCalls = 0;
  taskQueries = [];
  server.use(
    http.get(`${API}/projects/1`, () => {
      detailCalls += 1;
      return HttpResponse.json({ data: projectDetail });
    }),
    http.get(`${API}/projects/1/tasks`, ({ request }) => {
      taskQueries.push(new URL(request.url).searchParams);
      return HttpResponse.json(taskListResponse([ownTask, othersTask, dueOnReportingDate]));
    }),
  );
});

function renderTasks(route = '/projects/1?tab=tasks') {
  return renderWithProviders(<ProjectDetailPage />, { route, path: '/projects/:id' });
}

function rowFor(title: string) {
  return screen.getByText(title).closest('tr')!;
}

describe('Project Tasks tab', () => {
  it('shows the Overdue badge from the API flag, not for a task due exactly on the reporting date', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderTasks();

    await screen.findByText('Overdue task');
    expect(within(rowFor('Overdue task')).getByText('Overdue')).toBeInTheDocument();
    expect(within(rowFor('Due on reporting date')).queryByText('Overdue')).not.toBeInTheDocument();
    expect(within(rowFor('Due on reporting date')).getByText('Due soon')).toBeInTheDocument();
  });

  it('writes filters to the URL and reads them back on reload', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    const { unmount } = renderTasks();

    await screen.findByText('Own task');
    await user.click(screen.getByLabelText('Overdue only'));
    await user.click(screen.getByRole('button', { name: 'Status filter' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Blocked' }));

    await waitFor(() => {
      const location = screen.getByTestId('location').textContent!;
      expect(location).toContain('overdue=true');
      expect(location).toContain('status=blocked');
    });
    await waitFor(() => {
      const last = taskQueries.at(-1)!;
      expect(last.get('overdue')).toBe('true');
      expect(last.get('status')).toBe('blocked');
    });

    // "Reload": a fresh mount from the same URL sends the same filters.
    const url = screen.getByTestId('location').textContent!;
    unmount();
    taskQueries = [];
    renderTasks(url);
    await screen.findByText('Own task');
    expect(taskQueries[0].get('overdue')).toBe('true');
    expect(taskQueries[0].get('status')).toBe('blocked');
    expect(screen.getByLabelText('Overdue only')).toBeChecked();
  });

  it('sends the Unassigned choice as unassigned=true', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    renderTasks();

    await screen.findByText('Own task');
    await user.click(screen.getByLabelText('Assignee'));
    await user.click(await screen.findByRole('option', { name: 'Unassigned' }));

    await waitFor(() => expect(taskQueries.at(-1)!.get('unassigned')).toBe('true'));
    expect(taskQueries.at(-1)!.get('assigneeId')).toBeNull();
  });

  it('gives a contributor an edit action on their own task only, with only progress and status', async () => {
    const user = userEvent.setup();
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderTasks();

    await screen.findByText('Own task');
    expect(screen.queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Overdue task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Own task' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('spinbutton', { name: 'Progress' })).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/^Status/)).toBeInTheDocument();
    for (const label of [/^Title/, /^Assignee/, /^Priority/, /^Due date/, /^Weight/, /^Description/]) {
      expect(within(sheet).queryByLabelText(label)).not.toBeInTheDocument();
    }
  });

  it('saving a task sends only the changed field and refetches the project detail (progress)', async () => {
    const user = userEvent.setup();
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    let patched: unknown;
    server.use(
      http.patch(`${API}/tasks/1`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ data: { ...ownTask, progress: 60, version: 4 } });
      }),
    );
    renderTasks();

    await screen.findByText('Own task');
    expect(detailCalls).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Edit Own task' }));
    const progress = await screen.findByRole('spinbutton', { name: 'Progress' });
    await user.clear(progress);
    await user.type(progress, '60');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(detailCalls).toBe(2));
    expect(patched).toEqual({ progress: 60, version: 3 });
  });

  it('names the rejected fields when the backend answers 403 with details.fields', async () => {
    const user = userEvent.setup();
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    server.use(
      http.patch(`${API}/tasks/1`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'FORBIDDEN',
              message: 'Only progress and status may be updated on your own task',
              details: { fields: ['dueDate', 'weight'] },
              requestId: 'req-403',
            },
          },
          { status: 403 },
        ),
      ),
    );
    renderTasks();

    await user.click(await screen.findByRole('button', { name: 'Edit Own task' }));
    const progress = await screen.findByRole('spinbutton', { name: 'Progress' });
    await user.clear(progress);
    await user.type(progress, '50');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed: due date, weight.');
  });

  it('opens the conflict dialog when a manager edit hits 409', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    server.use(
      http.patch(`${API}/tasks/2`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'VERSION_CONFLICT',
              message: 'Resource was modified by someone else',
              details: { currentVersion: 4 },
              requestId: 'req-409',
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderTasks();

    await user.click(await screen.findByRole('button', { name: 'Edit Overdue task' }));
    const title = await screen.findByLabelText(/^Title/);
    await user.clear(title);
    await user.type(title, 'Renamed task');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('This record was changed by someone else')).toBeInTheDocument();
  });

  it('offers delete only on an untouched task (todo, 0 %) and confirms first', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    let deleted = false;
    server.use(
      http.delete(`${API}/tasks/3`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderTasks();

    await screen.findByText('Own task');
    expect(screen.queryByRole('button', { name: 'Delete Own task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Overdue task' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Due on reporting date' }));
    expect(deleted).toBe(false);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('validates the create form like the backend: weight > 0 and due date within the project', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    let posted = false;
    server.use(
      http.post(`${API}/projects/1/tasks`, () => {
        posted = true;
        return HttpResponse.json({ data: ownTask }, { status: 201 });
      }),
    );
    renderTasks();

    await user.click(await screen.findByRole('button', { name: 'New task' }));
    await user.type(await screen.findByLabelText(/^Title/), 'Write runbook');
    // Project PRJ-001 runs 2026-01-05 → 2027-03-31.
    await user.type(screen.getByLabelText(/^Due date/), '2027-06-30');
    const weight = screen.getByLabelText(/^Weight/);
    await user.clear(weight);
    await user.type(weight, '0');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByText('Due date must fall within the project dates')).toBeInTheDocument();
    expect(screen.getByText('Weight must be greater than 0')).toBeInTheDocument();
    expect(posted).toBe(false);
  });
});
