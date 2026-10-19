import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { YourFocus } from './YourFocus';

function stubCommon() {
  server.use(
    http.get(`${API}/dashboard/kpis`, () =>
      HttpResponse.json({
        data: { kpis: [] },
        meta: { asOf: '2026-09-30', appliedFilters: [], ignoredFilters: [], generatedAt: '2026-10-19T00:00:00Z' },
      }),
    ),
    http.get(`${API}/notifications`, () =>
      HttpResponse.json({ data: [], meta: { page: 1, pageSize: 8, total: 0 }, unreadCount: 0 }),
    ),
  );
}

describe('YourFocus', () => {
  beforeEach(() => stubCommon());

  it('shows overdue and due-soon tasks for a contributor', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    server.use(
      http.get(`${API}/tasks/mine`, () =>
        HttpResponse.json({
          data: [
            { id: 1, title: 'Task A', status: 'in_progress', isOverdue: true, daysToDue: -3 },
            { id: 2, title: 'Task B', status: 'in_progress', isOverdue: false, daysToDue: 7 },
            { id: 3, title: 'Task C', status: 'done', isOverdue: true, daysToDue: -1 },
          ],
          meta: { page: 1, pageSize: 20, total: 3 },
        }),
      ),
    );

    renderWithProviders(<YourFocus />);

    expect(await screen.findByText('overdue tasks')).toBeInTheDocument();
    expect(screen.getByText('tasks due soon')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    const overdueLink = links.find((l) => l.textContent?.includes('overdue tasks'));
    const dueSoonLink = links.find((l) => l.textContent?.includes('tasks due soon'));
    expect(overdueLink).toHaveTextContent('1');
    expect(dueSoonLink).toHaveTextContent('1');
  });

  it('shows pending CRs and finance alerts for a project manager', async () => {
    mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
    server.use(
      http.get(`${API}/change-requests`, () =>
        HttpResponse.json({
          data: [{ id: 10, title: 'CR-1', status: 'submitted' }],
          meta: { page: 1, pageSize: 20, total: 2 },
        }),
      ),
      http.get(`${API}/finance/alerts`, () =>
        HttpResponse.json({
          data: {
            alerts: [
              { projectId: 1, projectCode: 'PRJ-001', alertType: 'overrun', message: 'Over budget' },
            ],
          },
        }),
      ),
    );

    renderWithProviders(<YourFocus />);

    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('CRs awaiting decision')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('finance alerts')).toBeInTheDocument();
  });

  it('shows failed runs and pending CRs for an admin', async () => {
    mockSession('admin');
    server.use(
      http.get(`${API}/admin/automation/runs`, () =>
        HttpResponse.json({
          data: [
            { id: 1, status: 'error', runAt: '2026-10-18T10:00:00Z' },
            { id: 2, status: 'success', runAt: '2026-10-18T09:00:00Z' },
          ],
          meta: { page: 1, pageSize: 20, total: 2 },
        }),
      ),
      http.get(`${API}/change-requests`, () =>
        HttpResponse.json({
          data: [{ id: 10, title: 'CR-1', status: 'submitted' }],
          meta: { page: 1, pageSize: 20, total: 3 },
        }),
      ),
    );

    renderWithProviders(<YourFocus />);

    expect(await screen.findByText('failed automation runs')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('pending change requests')).toBeInTheDocument();
  });

  it('shows the empty state when there are no items', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    server.use(
      http.get(`${API}/tasks/mine`, () =>
        HttpResponse.json({
          data: [],
          meta: { page: 1, pageSize: 20, total: 0 },
        }),
      ),
    );

    renderWithProviders(<YourFocus />);

    expect(await screen.findByText('Nothing needs your attention.')).toBeInTheDocument();
  });
});
