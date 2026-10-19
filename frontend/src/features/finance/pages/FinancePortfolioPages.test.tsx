import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API } from '@/test/handlers';
import { financials } from '@/test/fixtures/finance';
import { projectOptionsResponse } from '@/test/fixtures/governance';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/server';
import { mockSession } from '@/test/session';
import { FinanceAlertsPage } from './FinanceAlertsPage';
import { FinanceComparisonPage } from './FinanceComparisonPage';

beforeEach(() => {
  mockSession('project_manager', [{ projectId: 1, memberRole: 'manager' }]);
  server.use(http.get(`${API}/dashboard/filters`, () => HttpResponse.json(projectOptionsResponse)));
});

describe('Finance alerts page', () => {
  it('lists the API alerts with a link to the project finance tab and passes the department filter', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get(`${API}/finance/alerts`, ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: {
            alerts: [
              {
                projectId: 4,
                projectCode: 'PRJ-004',
                projectName: 'Field Mobility App',
                alertType: 'OVERSPENT',
                severity: 'critical',
                currentBudget: 95000,
                actualSpend: 103328,
                eac: 103328,
                utilization: 1.09,
              },
            ],
            currency: 'AED',
          },
        });
      }),
    );
    renderWithProviders(<FinanceAlertsPage />, { route: '/finance/alerts?departmentId=1' });

    const link = await screen.findByRole('link', { name: 'PRJ-004 — Field Mobility App' });
    expect(link).toHaveAttribute('href', '/projects/4?tab=finance');
    expect(screen.getByText('Overspent')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(queries[0].get('departmentId')).toBe('1');
  });
});

describe('Finance comparison page', () => {
  it('shows the projects the API returned and names the excluded ones', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      http.get(`${API}/finance/comparison`, ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          data: { projects: [financials({ projectId: 1 })], excluded: [4], currency: 'AED' },
        });
      }),
    );
    renderWithProviders(<FinanceComparisonPage />, { route: '/finance/comparison?projectIds=1,4' });

    expect(await screen.findByRole('table', { name: 'Project financials side by side' })).toBeInTheDocument();
    expect(
      screen.getByText('Not shown (not found or no access): PRJ-004 — Field Mobility App'),
    ).toBeInTheDocument();
    await waitFor(() => expect(queries[0].get('projectIds')).toBe('1,4'));
  });

  it('asks for a selection before calling the API', async () => {
    let called = false;
    server.use(
      http.get(`${API}/finance/comparison`, () => {
        called = true;
        return HttpResponse.json({ data: { projects: [], excluded: [], currency: 'AED' } });
      }),
    );
    renderWithProviders(<FinanceComparisonPage />, { route: '/finance/comparison' });

    expect(await screen.findByText('Choose one or more projects to compare.')).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
