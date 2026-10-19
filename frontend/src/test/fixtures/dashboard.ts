import { HttpResponse, http } from 'msw';
import { API } from '@/test/handlers';

// Dashboard fixtures shaped like the live API (captured against the seeded
// DB for feature 18A). `meta` mirrors the backend rule: categoryId is
// "applied" only on endpoints whose SQL filters by category, "ignored"
// everywhere else.

const HONOURS_CATEGORY = new Set(['monthly-spend', 'spend-by-category', 'drill/costs']);

export function dashboardMeta(endpoint: string, params: URLSearchParams, extra: Record<string, number> = {}) {
  const appliedFilters: string[] = [];
  const ignoredFilters: string[] = [];
  for (const key of ['departmentId', 'projectId', 'managerId', 'status', 'from', 'to']) {
    if (params.get(key)) appliedFilters.push(key);
  }
  if (params.get('categoryId')) {
    (HONOURS_CATEGORY.has(endpoint) ? appliedFilters : ignoredFilters).push('categoryId');
  }
  return {
    asOf: '2026-09-30',
    appliedFilters,
    ignoredFilters,
    generatedAt: '2026-10-19T06:45:42.000Z',
    ...extra,
  };
}

export function kpisData(overrides: Partial<Record<string, number>> = {}) {
  const values: Record<string, [number, string]> = {
    totalProjects: [8, 'count'],
    activeProjects: [5, 'count'],
    portfolioProgressPct: [49.62, 'pct'],
    taskCompletionPct: [34.38, 'pct'],
    overdueIncompleteTasks: [42, 'count'],
    milestonesDue14d: [0, 'count'],
    openHighExposureRisks: [1, 'count'],
    blockedTasks: [21, 'count'],
    pendingChangeRequests: [6, 'count'],
    approvedBudget: [896000, 'AED'],
    actualSpend: [580390, 'AED'],
    remainingBudget: [315610, 'AED'],
    utilizationPct: [65, 'pct'],
    forecastEac: [769390, 'AED'],
    projectedOverrunCount: [4, 'count'],
    projectedOverrunAmount: [92260, 'AED'],
  };
  return Object.entries(values).map(([key, [value, unit]]) => ({
    key,
    value: overrides[key] ?? value,
    unit,
    drill: { endpoint: `/api/v1/dashboard/${key}` },
  }));
}

const WIDGET_DATA: Record<string, unknown> = {
  'project-health': {
    projects: [
      {
        projectId: 2,
        code: 'PRJ-002',
        name: 'Core Network Refresh',
        status: 'active',
        progressPct: 42.42,
        deliveryStatus: 'at_risk',
        utilization: 0.94,
        currentBudget: 160000,
        eac: 160000,
        openHighRisks: 0,
        overdueTasks: 6,
      },
    ],
  },
  'budget-vs-actual-eac': {
    projects: [
      {
        projectId: 2,
        code: 'PRJ-002',
        name: 'Core Network Refresh',
        currentBudget: 160000,
        actualSpend: 150000,
        eac: 170000,
        isOverrun: true,
      },
    ],
  },
  'monthly-spend': {
    months: [{ month: '2026-09-01', actualSpend: 64394, forecast: null, cumulativeActual: 580390 }],
  },
  'spend-by-category': {
    categories: [{ categoryId: 1, categoryCode: 'LAB', categoryName: 'Labour', totalSpend: 162992 }],
  },
  'overdue-by-owner': { owners: [{ assigneeId: 13, assigneeName: 'Einar Moore', count: 6 }] },
  'risk-matrix': {
    cells: [{ probability: 5, impact: 4, count: 1, band: 'high' }],
    totalOpenRisks: 1,
  },
  milestones: {
    milestones: [
      {
        id: 24,
        projectId: 8,
        projectCode: 'PRJ-008',
        name: 'Go-live',
        dueDate: '2026-10-31',
        status: 'planned',
        isOverdue: false,
        daysToDue: 31,
      },
    ],
  },
};

export const drillCostRow = {
  id: 81,
  projectId: 5,
  projectCode: 'PRJ-005',
  categoryName: 'Hardware',
  txnDate: '2026-09-27',
  amount: 5818,
  entryType: 'expense',
  description: 'Oriental Metal Chair',
};

export const dashboardFilterOptions = {
  data: {
    departments: [
      { id: 1, label: 'Digital Platforms' },
      { id: 2, label: 'Network Engineering' },
    ],
    projects: [{ id: 2, label: 'PRJ-002 — Core Network Refresh' }],
    managers: [{ id: 2, label: 'Christelle Satterfield' }],
    statuses: ['active'],
    categories: [
      { id: 1, label: 'LAB — Labour' },
      { id: 3, label: 'HW — Hardware' },
    ],
  },
  meta: {
    asOf: '2026-09-30',
    appliedFilters: [],
    ignoredFilters: [],
    generatedAt: '2026-10-19T06:45:42.000Z',
  },
};

/**
 * msw handlers for every dashboard endpoint. `calls[endpoint]` collects the
 * query params of each request so tests can assert what was sent.
 */
export function dashboardHandlers(calls: Record<string, URLSearchParams[]>) {
  const record = (endpoint: string, request: Request) => {
    const params = new URL(request.url).searchParams;
    (calls[endpoint] ??= []).push(params);
    return params;
  };
  return [
    http.get(`${API}/dashboard/filters`, () => HttpResponse.json(dashboardFilterOptions)),
    http.get(`${API}/dashboard/kpis`, ({ request }) => {
      const params = record('kpis', request);
      return HttpResponse.json({ data: { kpis: kpisData() }, meta: dashboardMeta('kpis', params) });
    }),
    ...Object.keys(WIDGET_DATA).map((endpoint) =>
      http.get(`${API}/dashboard/${endpoint}`, ({ request }) => {
        const params = record(endpoint, request);
        return HttpResponse.json({ data: WIDGET_DATA[endpoint], meta: dashboardMeta(endpoint, params) });
      }),
    ),
    http.get(`${API}/dashboard/drill/costs`, ({ request }) => {
      const params = record('drill/costs', request);
      return HttpResponse.json({
        data: [drillCostRow],
        meta: dashboardMeta('drill/costs', params, { page: 1, pageSize: 20, total: 67 }),
      });
    }),
  ];
}
