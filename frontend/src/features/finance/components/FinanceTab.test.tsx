import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { Toaster } from 'sonner';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectDetailPage } from '@/features/projects/pages/ProjectDetailPage';
import { formatMoney } from '@/lib/format';
import { API } from '@/test/handlers';
import {
  budgetResponse,
  categoriesResponse,
  cost,
  forecastsResponse,
  postedCost,
  reversalCost,
  summaryResponse,
} from '@/test/fixtures/finance';
import { listResponse } from '@/test/fixtures/governance';
import { projectDetail } from '@/test/fixtures/projects';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';

const draft = cost();

let summaryCalls: number;
let costQueries: URLSearchParams[];
let posts: { key: string | null }[];
let reversals: unknown[];

// Each call to GET /financial-summary returns the next response in the
// list (the last one repeats), so a test can prove the screen shows the
// *refetched* value rather than a locally computed one.
function serveSummaries(...responses: ReturnType<typeof summaryResponse>[]) {
  server.use(
    http.get(`${API}/projects/1/financial-summary`, () => {
      const res = responses[Math.min(summaryCalls, responses.length - 1)];
      summaryCalls += 1;
      return HttpResponse.json(res);
    }),
  );
}

beforeEach(() => {
  summaryCalls = 0;
  costQueries = [];
  posts = [];
  reversals = [];
  server.use(
    http.get(`${API}/projects/1`, () => HttpResponse.json({ data: projectDetail })),
    http.get(`${API}/projects/1/budget`, () => HttpResponse.json(budgetResponse())),
    http.get(`${API}/projects/1/forecasts`, () => HttpResponse.json(forecastsResponse)),
    http.get(`${API}/cost-categories`, () => HttpResponse.json(categoriesResponse)),
    http.get(`${API}/projects/1/costs`, ({ request }) => {
      costQueries.push(new URL(request.url).searchParams);
      return HttpResponse.json(listResponse([draft, postedCost, reversalCost]));
    }),
    http.post(`${API}/costs/3/post`, async ({ request }) => {
      posts.push({ key: request.headers.get('Idempotency-Key') });
      await delay(30);
      return HttpResponse.json({ data: { ...draft, status: 'posted' }, financials: {} });
    }),
    http.post(`${API}/costs/7/reverse`, async ({ request }) => {
      reversals.push(await request.json());
      return HttpResponse.json({ data: reversalCost }, { status: 201 });
    }),
  );
  serveSummaries(summaryResponse());
});

function renderFinance() {
  return renderWithProviders(
    <>
      <ProjectDetailPage />
      <Toaster />
    </>,
    { route: '/projects/1?tab=finance', path: '/projects/:id' },
  );
}

const pm = () => mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);

// toHaveTextContent collapses the received text's whitespace (incl. the
// no-break space Intl puts after "AED") but not the expected string's.
const money = (n: number) => formatMoney(n).replace(/\s/g, ' ');

// The KPI card's value, found through its label.
function kpiValue(label: string) {
  return screen.getByText(label, { selector: 'p' }).nextElementSibling;
}

describe('Project Finance tab', () => {
  it('posting a cost confirms, sends one Idempotency-Key, then shows the refetched summary', async () => {
    const user = userEvent.setup();
    pm();
    serveSummaries(summaryResponse({ actualSpend: 150000 }), summaryResponse({ actualSpend: 153000 }));
    renderFinance();

    await user.click(await screen.findByRole('button', { name: 'Post Lab workstation quote' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      "Posted costs can't be edited or deleted; corrections are made by reversal",
    );
    expect(posts).toHaveLength(0);

    await user.dblClick(within(dialog).getByRole('button', { name: 'Post cost' }));

    await screen.findByText('Cost posted');
    expect(posts).toHaveLength(1);
    expect(posts[0].key).toMatch(/^[0-9a-f-]{36}$/);
    // Invalidation, not a cache patch: the summary is fetched again and
    // the card shows the second response's value.
    await waitFor(() => expect(summaryCalls).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(kpiValue('Actual spend')).toHaveTextContent(money(153000)));
  });

  it('offers different row actions for draft, posted and reversal entries', async () => {
    pm();
    renderFinance();

    await screen.findByRole('button', { name: 'Post Lab workstation quote' });
    expect(screen.getByRole('button', { name: 'Edit Lab workstation quote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Lab workstation quote' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reverse Lab workstation quote' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Reverse Contractor invoice May' })).toBeInTheDocument();
    for (const action of ['Post', 'Edit', 'Delete']) {
      expect(
        screen.queryByRole('button', { name: `${action} Contractor invoice May` }),
      ).not.toBeInTheDocument();
    }

    for (const action of ['Post', 'Edit', 'Delete', 'Reverse']) {
      expect(
        screen.queryByRole('button', { name: `${action} Reversal: duplicate invoice` }),
      ).not.toBeInTheDocument();
    }
  });

  it('reversal requires a reason before anything is sent', async () => {
    const user = userEvent.setup();
    pm();
    renderFinance();

    await user.click(await screen.findByRole('button', { name: 'Reverse Contractor invoice May' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reverse cost' }));

    expect(await within(dialog).findByText('A reason is required')).toBeInTheDocument();
    expect(reversals).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Reason/), 'Duplicate invoice');
    await user.click(within(dialog).getByRole('button', { name: 'Reverse cost' }));
    await waitFor(() => expect(reversals).toEqual([{ reason: 'Duplicate invoice' }]));
  });

  it('forecast grid locks the reporting month and earlier, and opens the months after it', async () => {
    pm();
    renderFinance();

    // Reporting date 2026-09-30 (default /dashboard/kpis handler).
    expect(await screen.findByLabelText('Sep 2026')).toBeDisabled();
    expect(screen.getByLabelText('Jan 2026')).toBeDisabled();
    expect(screen.getByLabelText('Oct 2026')).toBeEnabled();
    expect(screen.getByLabelText('Oct 2026')).toHaveValue('15000');
    expect(screen.getByLabelText('Mar 2027')).toBeEnabled();
  });

  it('is read-only for a contributor: no Add, Post, Reverse, revision or forecast save', async () => {
    mockSession('contributor', [{ projectId: 1, memberRole: 'contributor' }]);
    renderFinance();

    await screen.findByText('Contractor invoice May');
    expect(screen.queryByRole('button', { name: /^Add cost/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Post / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Reverse / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request revision' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save forecast' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Oct 2026')).toBeDisabled();
  });

  it('shows "—" for utilization when the API returns null (zero budget)', async () => {
    pm();
    serveSummaries(
      summaryResponse({ currentBudget: 0, actualSpend: 0, remainingBudget: 0, utilization: null }),
    );
    renderFinance();

    await screen.findByText('Utilization', { selector: 'p' });
    expect(kpiValue('Utilization')).toHaveTextContent('—');
  });

  it('Actual spend drills down to posted costs up to the as-of date', async () => {
    const user = userEvent.setup();
    pm();
    renderFinance();

    await user.click(
      await screen.findByRole('button', {
        name: 'Actual spend: show the posted transactions behind this number',
      }),
    );

    await screen.findByText(/Showing the posted transactions that make up actual spend as of 30 Sep 2026/);
    await waitFor(() => {
      const last = costQueries.at(-1)!;
      expect(last.get('status')).toBe('posted');
      expect(last.get('to')).toBe('2026-09-30');
    });
    expect(screen.getByTestId('location')).toHaveTextContent('status=posted');
  });

  it('a 403 from the post endpoint shows a toast with the request id', async () => {
    const user = userEvent.setup();
    pm();
    server.use(
      http.post(`${API}/costs/3/post`, () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Not allowed', requestId: 'req-post-403' } },
          { status: 403 },
        ),
      ),
    );
    renderFinance();

    await user.click(await screen.findByRole('button', { name: 'Post Lab workstation quote' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Post cost' }),
    );

    expect(await screen.findByText('Not allowed')).toBeInTheDocument();
    expect(screen.getByText('Request ID: req-post-403')).toBeInTheDocument();
  });

  it('pending revisions are labelled as outside the approved budget; an admin cannot decide their own', async () => {
    mockSession('admin');
    server.use(
      http.get(`${API}/projects/1/budget`, () =>
        HttpResponse.json(
          budgetResponse({
            revisions: [
              {
                id: 2,
                projectId: 1,
                amount: 10000,
                rationale: 'Extra licences for the pilot group',
                status: 'pending',
                requestedBy: 1,
                requestedByName: 'Garnet Wiegand',
                decidedBy: null,
                decidedByName: null,
                decidedAt: null,
                decisionReason: null,
                effectiveDate: '2026-10-01',
                createdAt: '2026-09-20T00:00:00.000Z',
              },
            ],
          }),
        ),
      ),
    );
    renderFinance();

    const table = await screen.findByRole('table', { name: 'Budget revisions' });
    expect(within(table).getByText('Not included in approved budget')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(within(table).getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
});
