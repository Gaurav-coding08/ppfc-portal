import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import { formatMoney } from '@/lib/format';
import { dashboardHandlers, dashboardMeta, kpisData } from '@/test/fixtures/dashboard';
import { API } from '@/test/handlers';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { DashboardPage } from './DashboardPage';

// Intl separates "AED" and the amount with a no-break space, which Testing
// Library normalises in the page text but not in a string matcher.
const money = (n: number) => formatMoney(n).replace(/\s/g, ' ');

let calls: Record<string, URLSearchParams[]>;

beforeEach(() => {
  calls = {};
  mockSession('admin');
  server.use(...dashboardHandlers(calls));
});

function renderDashboard(route = '/dashboard') {
  return renderWithProviders(<DashboardPage />, { route, path: '/dashboard' });
}

// The page also reads the unfiltered KPIs for the reporting date (the
// topbar's query), so assertions look at the latest *filtered* KPI call.
const lastKpiParams = () => calls.kpis!.filter((p) => p.size > 0).at(-1) ?? new URLSearchParams();

describe('DashboardPage', () => {
  it('reads filters from the URL and sends them to the KPI endpoint', async () => {
    renderDashboard('/dashboard?departmentId=1&status=active,on_hold&from=2026-07-01&to=2026-09-30');

    await screen.findByText(money(580390));
    const params = lastKpiParams();
    expect(params.get('departmentId')).toBe('1');
    expect(params.get('status')).toBe('active,on_hold');
    expect(params.get('from')).toBe('2026-07-01');
    expect(params.get('to')).toBe('2026-09-30');
    // The reporting date is never sent: the backend's app_settings date applies.
    expect(params.get('asOf')).toBeNull();

    // The controls show the URL state.
    expect(await screen.findByRole('combobox', { name: 'Department' })).toHaveTextContent(
      'Digital Platforms',
    );
    expect(screen.getByRole('combobox', { name: 'Timeframe' })).toHaveTextContent('Q3 2026');
  });

  it('writes a changed filter to the URL and refetches KPIs with it', async () => {
    const user = userEvent.setup();
    renderDashboard('/dashboard?departmentId=1');
    await screen.findByText(money(580390));

    await user.click(screen.getByRole('combobox', { name: 'Cost category' }));
    await user.click(await screen.findByRole('option', { name: 'HW — Hardware' }));

    await waitFor(() => expect(lastKpiParams().get('categoryId')).toBe('3'));
    expect(lastKpiParams().get('departmentId')).toBe('1');
    expect(screen.getByTestId('location')).toHaveTextContent('departmentId=1');
    expect(screen.getByTestId('location')).toHaveTextContent('categoryId=3');

    // Reset clears every filter from the URL.
    await user.click(screen.getByRole('button', { name: /Reset filters/ }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/));
  });

  it('shows a failing visual its own error while the other widgets render', async () => {
    server.use(
      http.get(`${API}/dashboard/spend-by-category`, () =>
        HttpResponse.json(
          { error: { code: 'INTERNAL', message: 'Spend query failed', requestId: 'req-cat-500' } },
          { status: 500 },
        ),
      ),
    );
    renderDashboard();

    const failing = await screen.findByRole('region', { name: 'Spend by category' });
    expect(await within(failing).findByText('Spend query failed')).toBeInTheDocument();
    expect(within(failing).getByText('Request ID: req-cat-500')).toBeInTheDocument();
    expect(within(failing).getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    // KPIs and other widgets are unaffected.
    expect(screen.getByText(money(580390))).toBeInTheDocument();
    const matrix = screen.getByRole('region', { name: 'Risk matrix' });
    expect(within(matrix).getByText('1 open risk in total')).toBeInTheDocument();
    const health = screen.getByRole('region', { name: 'Project health' });
    expect(within(health).getByText('PRJ-002')).toBeInTheDocument();
  });

  it('opens the Actual spend drill-down with the finance drill endpoint and current filters', async () => {
    const user = userEvent.setup();
    renderDashboard('/dashboard?departmentId=1&categoryId=3');
    await screen.findByText(money(580390));

    await user.click(screen.getByRole('button', { name: 'Actual spend: show records' }));

    const drawer = await screen.findByRole('dialog');
    await within(drawer).findByText('Oriental Metal Chair');
    const params = calls['drill/costs']!.at(-1)!;
    expect(params.get('departmentId')).toBe('1');
    // The Actual spend KPI is not split by category (meta.ignoredFilters),
    // so its drill must not be either — otherwise the counts wouldn't reconcile.
    expect(params.get('categoryId')).toBeNull();
    expect(params.get('page')).toBe('1');

    // Same filter context at the top, and "N records · KPI value" to reconcile.
    expect(within(drawer).getByTestId('drill-filter-context')).toHaveTextContent(
      'Department: Digital Platforms',
    );
    expect(within(drawer).getByTestId('drill-filter-context')).toHaveTextContent('Category: all categories');
    expect(within(drawer).getByText(/67 records/)).toBeInTheDocument();
    expect(within(drawer).getByText(money(580390))).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'PRJ-005' })).toHaveAttribute(
      'href',
      '/projects/5?tab=finance',
    );
  });

  it('shows the category chip only on visuals whose endpoint applied the category filter', async () => {
    renderDashboard('/dashboard?categoryId=1');

    const byCategory = await screen.findByRole('region', { name: 'Spend by category' });
    expect(await within(byCategory).findByText('Filtered by category')).toBeInTheDocument();
    const monthly = screen.getByRole('region', { name: 'Monthly cost trend' });
    expect(await within(monthly).findByText('Filtered by category')).toBeInTheDocument();

    const bva = screen.getByRole('region', { name: 'Budget vs actual vs EAC by project' });
    await within(bva).findByText('All categories');
    expect(within(bva).queryByText('Filtered by category')).not.toBeInTheDocument();

    const financial = screen.getByRole('region', { name: 'Financial' });
    expect(within(financial).getByText('All categories')).toBeInTheDocument();
    expect(within(financial).queryByText('Filtered by category')).not.toBeInTheDocument();
  });

  it('refetches the KPIs after a task mutation instead of patching them', async () => {
    const user = userEvent.setup();
    let kpiCalls = 0;
    server.use(
      http.get(`${API}/dashboard/kpis`, ({ request }) => {
        kpiCalls += 1;
        const overdue = kpiCalls === 1 ? 42 : 41;
        return HttpResponse.json({
          data: { kpis: kpisData({ overdueIncompleteTasks: overdue }) },
          meta: dashboardMeta('kpis', new URL(request.url).searchParams),
        });
      }),
      http.patch(`${API}/tasks/1`, () => HttpResponse.json({ data: { id: 1, progress: 100, version: 2 } })),
    );

    // Stands in for a task edit made elsewhere in the app (same mutation hook).
    function MarkDone() {
      const update = useUpdateTask();
      return (
        <button type="button" onClick={() => update.mutate({ id: 1, body: { progress: 100, version: 1 } })}>
          Mark task done
        </button>
      );
    }

    renderWithProviders(
      <>
        <DashboardPage />
        <MarkDone />
      </>,
      { route: '/dashboard', path: '/dashboard' },
    );

    const card = await screen.findByRole('button', { name: 'Overdue tasks: show records' });
    await within(card).findByText('42');

    await user.click(screen.getByRole('button', { name: 'Mark task done' }));

    await within(card).findByText('41');
    expect(kpiCalls).toBe(2);
  });
});
