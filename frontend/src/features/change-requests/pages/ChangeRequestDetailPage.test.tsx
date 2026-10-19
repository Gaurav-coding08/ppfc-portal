import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { Toaster } from 'sonner';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { changeRequest, projectOptionsResponse } from '@/test/fixtures/governance';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { ChangeRequestDetailPage } from './ChangeRequestDetailPage';

type Cr = ReturnType<typeof changeRequest>;

let detailCalls: number;
let decisions: { body: unknown; key: string | null }[];

beforeEach(() => {
  detailCalls = 0;
  decisions = [];
  server.use(http.get(`${API}/dashboard/filters`, () => HttpResponse.json(projectOptionsResponse)));
});

function serveDetail(cr: Cr) {
  server.use(
    http.get(`${API}/change-requests/${cr.id}`, () => {
      detailCalls += 1;
      return HttpResponse.json({ data: cr });
    }),
  );
}

function serveDecision(respond: () => Response | Promise<Response>) {
  server.use(
    http.post(`${API}/change-requests/14/decision`, async ({ request }) => {
      decisions.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') });
      return respond();
    }),
  );
}

function renderDetail(id = 14) {
  return renderWithProviders(
    <>
      <ChangeRequestDetailPage />
      <Toaster />
    </>,
    { route: `/change-requests/${id}`, path: '/change-requests/:id' },
  );
}

const pm = () => mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);

describe('ChangeRequestDetailPage', () => {
  it('shows the history timeline from the API', async () => {
    pm();
    serveDetail(
      changeRequest({
        status: 'returned',
        history: [
          {
            id: 1,
            fromStatus: null,
            toStatus: 'submitted',
            actorId: 6,
            actorName: 'Estell Conroy',
            reason: null,
            createdAt: '2026-09-10T09:00:00.000Z',
          },
          {
            id: 2,
            fromStatus: 'submitted',
            toStatus: 'returned',
            actorId: 2,
            actorName: 'Christelle Satterfield',
            reason: 'Add a cost estimate',
            createdAt: '2026-09-12T09:00:00.000Z',
          },
        ],
      }),
    );
    renderDetail();

    const timeline = await screen.findByRole('list', { name: 'Status history' });
    expect(timeline.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('“Add a cost estimate”')).toBeInTheDocument();
  });

  it('requires a reason before any decision is sent', async () => {
    const user = userEvent.setup();
    pm();
    serveDetail(changeRequest());
    serveDecision(() => HttpResponse.json({ data: changeRequest({ status: 'approved' }) }));
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('A reason is required for every decision')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(decisions).toHaveLength(0);
  });

  it('disables the panel for the requester', async () => {
    pm();
    // Christelle (id 2) raised this CR on a project she manages.
    serveDetail(changeRequest({ requestedBy: 2, requesterName: 'Christelle Satterfield' }));
    renderDetail();

    expect(await screen.findByText(/You can't decide your own request/)).toBeInTheDocument();
    for (const name of ['Approve', 'Return', 'Reject']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByLabelText(/^Reason/)).toBeDisabled();
  });

  it('a double click on Approve sends exactly one request, with an Idempotency-Key', async () => {
    const user = userEvent.setup();
    pm();
    serveDetail(changeRequest());
    serveDecision(async () => {
      await delay(50);
      return HttpResponse.json({ data: changeRequest({ status: 'approved', version: 2 }) });
    });
    renderDetail();

    await user.type(await screen.findByLabelText(/^Reason/), 'Within agreed scope');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('does not change the project budget or costs');
    await user.dblClick(within(dialog).getByRole('button', { name: 'Approve' }));

    await screen.findByText('Change request approved');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].key).toMatch(/^[0-9a-f-]{36}$/);
    expect(decisions[0].body).toEqual({ decision: 'approve', reason: 'Within agreed scope', version: 1 });
    // Invalidation, not a cache patch: the detail is fetched again.
    await waitFor(() => expect(detailCalls).toBeGreaterThan(1));
  });

  it('shows a 403 from the decision endpoint as a toast with the request id', async () => {
    const user = userEvent.setup();
    pm();
    serveDetail(changeRequest());
    serveDecision(() =>
      HttpResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'You cannot decide change requests on this project',
            requestId: 'req-cr-403',
          },
        },
        { status: 403 },
      ),
    );
    renderDetail();

    await user.type(await screen.findByLabelText(/^Reason/), 'Not needed');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reject' }));

    expect(await screen.findByText('You cannot decide change requests on this project')).toBeInTheDocument();
    expect(screen.getByText('Request ID: req-cr-403')).toBeInTheDocument();
  });

  it('approved CRs show the finance note and no actions', async () => {
    pm();
    serveDetail(
      changeRequest({
        status: 'approved',
        decidedBy: 1,
        deciderName: 'Garnet Wiegand',
        decisionReason: 'Agreed',
      }),
    );
    renderDetail();

    expect(await screen.findByText(/Approval does not change budget or costs/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit and resubmit' })).not.toBeInTheDocument();
  });

  it('a contributor sees no decision panel on a submitted CR', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    serveDetail(changeRequest({ requestedBy: 8, requesterName: 'Anabelle Reichert-Sipes' }));
    renderDetail();

    await screen.findByText('Add offline mode to the field app');
    expect(screen.queryByRole('heading', { name: 'Decision' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('the requester can edit and resubmit a returned CR', async () => {
    const user = userEvent.setup();
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    serveDetail(changeRequest({ status: 'returned', version: 2, decisionReason: 'Add a cost estimate' }));
    let resubmitted: unknown;
    server.use(
      http.post(`${API}/change-requests/14/resubmit`, async ({ request }) => {
        resubmitted = await request.json();
        return HttpResponse.json({ data: changeRequest({ status: 'submitted', version: 3 }) });
      }),
    );
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Edit and resubmit' }));
    // The sheet repeats the reviewer's reason next to the form.
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/Returned because:/).parentElement).toHaveTextContent(
      'Add a cost estimate',
    );
    const title = within(sheet).getByLabelText(/^Title/);
    await user.clear(title);
    await user.type(title, 'Offline mode, with cost estimate');
    await user.click(screen.getByRole('button', { name: 'Resubmit' }));

    await waitFor(() =>
      expect(resubmitted).toEqual({ title: 'Offline mode, with cost estimate', version: 2 }),
    );
  });
});
