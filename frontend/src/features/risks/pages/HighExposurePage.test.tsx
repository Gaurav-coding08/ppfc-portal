import { screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { listResponse, projectOptionsResponse, risk } from '@/test/fixtures/governance';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { HighExposurePage } from './HighExposurePage';

let queries: URLSearchParams[];

beforeEach(() => {
  queries = [];
  mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
  server.use(http.get(`${API}/dashboard/filters`, () => HttpResponse.json(projectOptionsResponse)));
});

function serve(rows: ReturnType<typeof risk>[]) {
  server.use(
    http.get(`${API}/risks/high-exposure`, ({ request }) => {
      queries.push(new URL(request.url).searchParams);
      return HttpResponse.json(listResponse(rows));
    }),
  );
}

describe('HighExposurePage', () => {
  it('renders exactly the rows the API returns, in the API order', async () => {
    // Deliberately not in score order, to prove the page doesn't re-sort.
    serve([
      risk({
        id: 7,
        title: 'Data centre lease ends',
        score: 16,
        exposure: 'high',
        probability: 4,
        impact: 4,
        status: 'mitigating',
        mitigation: 'Negotiate extension',
      }),
      risk({
        id: 9,
        projectId: 4,
        title: 'Key engineer leaving',
        score: 20,
        exposure: 'high',
        probability: 4,
        impact: 5,
      }),
    ]);
    renderWithProviders(<HighExposurePage />);

    await screen.findByText('Data centre lease ends');
    const rows = screen.getAllByRole('row').slice(1); // drop the header row
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Data centre lease ends')).toBeInTheDocument();
    expect(within(rows[0]).getByText('16')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Key engineer leaving')).toBeInTheDocument();
    expect(within(rows[1]).getByText('20')).toBeInTheDocument();
    // The project column links back to that project's Risks tab.
    expect(
      await within(rows[1]).findByRole('link', { name: 'PRJ-004 — Field Mobility App' }),
    ).toHaveAttribute('href', '/projects/4?tab=risks');
    // No client-side filter params: the backend owns "high exposure".
    expect([...queries[0].keys()].sort()).toEqual(['page', 'pageSize']);
  });

  it('shows the empty state when the API returns no rows', async () => {
    serve([]);
    renderWithProviders(<HighExposurePage />);
    expect(await screen.findByText('No open high-exposure risks on your projects.')).toBeInTheDocument();
  });
});
