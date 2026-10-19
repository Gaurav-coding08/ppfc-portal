import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { notification } from '@/test/fixtures/admin';
import { API } from '@/test/handlers';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { notificationHref } from '../links';
import { NotificationBell } from './NotificationBell';

describe('NotificationBell', () => {
  it('shows the server unread count and takes the new count from a refetch after mark-as-read', async () => {
    const user = userEvent.setup();
    mockSession('project_manager', [{ projectId: 7, memberRole: 'manager' }]);
    const marked: string[] = [];
    // The second response reports 0 unread although only one item was
    // marked: a local decrement would show 1, the refetch shows none.
    server.use(
      http.get(`${API}/notifications`, () => {
        const read = marked.length > 0;
        return HttpResponse.json({
          data: [
            notification({ readAt: read ? '2026-10-19T09:00:00.000Z' : null }),
            notification({
              id: 70,
              title: 'Task overdue: PRJ-007 task 2',
              readAt: read ? '2026-10-19T09:00:00.000Z' : null,
            }),
          ],
          meta: { page: 1, pageSize: 8, total: 2 },
          unreadCount: read ? 0 : 2,
        });
      }),
      http.patch(`${API}/notifications/:id/read`, ({ params }) => {
        marked.push(String(params.id));
        return HttpResponse.json({ data: notification({ readAt: '2026-10-19T09:00:00.000Z' }) });
      }),
    );
    renderWithProviders(<NotificationBell />);

    const bell = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    expect(screen.getByTestId('unread-count')).toHaveTextContent('2');

    await user.click(bell);
    const link = await screen.findByRole('link', { name: 'Task overdue: PRJ-007 task 3' });
    expect(link).toHaveAttribute('href', '/projects/7?tab=tasks');
    await user.click(screen.getByRole('button', { name: 'Mark "Task overdue: PRJ-007 task 3" as read' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument());
    expect(marked).toEqual(['72']);
    expect(screen.queryByTestId('unread-count')).not.toBeInTheDocument();
  });
});

describe('notificationHref', () => {
  it('maps backend resource paths to SPA routes and drops unknown ones', () => {
    expect(notificationHref('/projects/7/tasks/75')).toBe('/projects/7?tab=tasks');
    expect(notificationHref('/projects/1/change-requests/3')).toBe('/change-requests/3');
    expect(notificationHref('/somewhere/else')).toBeNull();
    expect(notificationHref(null)).toBeNull();
  });
});
