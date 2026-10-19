import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { Toaster } from 'sonner';
import { describe, expect, it } from 'vitest';
import { automationRun, outboxEvent } from '@/test/fixtures/admin';
import { listResponse } from '@/test/fixtures/governance';
import { API } from '@/test/handlers';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { AutomationPage } from './AutomationPage';

function renderPage(route = '/admin/automation') {
  return renderWithProviders(
    <>
      <AutomationPage />
      <Toaster />
    </>,
    { route },
  );
}

describe('Automation page (admin)', () => {
  it('Run now shows the run summary and refetches the runs table from the server', async () => {
    const user = userEvent.setup();
    mockSession('admin');
    let runCreated = false;
    let runsCalls = 0;
    server.use(
      http.get(`${API}/admin/automation/runs`, () => {
        runsCalls += 1;
        const rows = runCreated
          ? [automationRun({ id: 9, trigger: 'manual', itemsFound: 42, itemsCreated: 3 }), automationRun()]
          : [automationRun()];
        return HttpResponse.json(listResponse(rows));
      }),
      http.post(`${API}/admin/automation/overdue-escalation/run`, () => {
        runCreated = true;
        return HttpResponse.json({
          data: {
            run: { runId: 9, itemsFound: 42, itemsCreated: 3 },
            dispatch: { processed: 3, sent: 3, retried: 0, failed: 0 },
          },
        });
      }),
    );
    renderPage();

    const table = await screen.findByRole('table', { name: 'Automation runs' });
    expect(within(table).getAllByRole('row')).toHaveLength(2); // header + 1 run
    expect(within(table).getByText('Scheduled')).toBeInTheDocument();
    expect(runsCalls).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Run now' }));

    expect(await screen.findByText('Overdue escalation finished')).toBeInTheDocument();
    expect(
      screen.getByText('Found 42 overdue tasks, queued 3 new events. Delivered 3, retrying 0, failed 0.'),
    ).toBeInTheDocument();
    // The new row comes from the refetch, not from the POST response.
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3));
    expect(within(table).getByText('Manual')).toBeInTheDocument();
    expect(runsCalls).toBe(2);
  });

  it('retries a failed outbox event only after confirmation', async () => {
    const user = userEvent.setup();
    mockSession('admin');
    const statusFilters: (string | null)[] = [];
    let retried = 0;
    server.use(
      http.get(`${API}/admin/automation/outbox`, ({ request }) => {
        statusFilters.push(new URL(request.url).searchParams.get('status'));
        return HttpResponse.json(
          listResponse([retried ? outboxEvent({ status: 'pending', attempts: 0 }) : outboxEvent()]),
        );
      }),
      http.post(`${API}/admin/automation/outbox/3/retry`, () => {
        retried += 1;
        return HttpResponse.json({ data: { id: 3, status: 'pending' } });
      }),
    );
    renderPage('/admin/automation?tab=outbox&status=failed');

    const table = await screen.findByRole('table', { name: 'Outbox events' });
    expect(statusFilters[0]).toBe('failed');
    await user.click(within(table).getByRole('button', { name: 'Retry' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(retried).toBe(0);
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Event #3 queued for delivery again')).toBeInTheDocument();
    expect(retried).toBe(1);
    // Refetched: the row is now pending and offers no Retry.
    await waitFor(() =>
      expect(within(table).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument(),
    );
  });
});
