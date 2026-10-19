import type { BudgetSummary, Cost, ProjectFinancials } from '@/features/finance/types';

// Shapes copied from real `GET /projects/{1,4}/financial-summary`,
// `/budget`, `/costs`, `/forecasts` and `/cost-categories` responses
// against the seeded dev DB (feature 17 Part B contract check). Every
// figure is set exactly as the API would return it — tests never derive one.
export function financials(overrides: Partial<ProjectFinancials> = {}): ProjectFinancials {
  return {
    projectId: 1,
    initialBudget: 200000,
    approvedRevisions: 20000,
    currentBudget: 220000,
    actualSpend: 150000,
    remainingBudget: 70000,
    utilization: 0.68,
    forecastToComplete: 75000,
    eac: 225000,
    projectedVariance: -5000,
    forecastMissing: false,
    isOverrun: true,
    isNearBudget: false,
    ...overrides,
  };
}

export function summaryResponse(overrides: Partial<ProjectFinancials> = {}) {
  return {
    data: {
      financials: financials(overrides),
      spendByCategory: [{ categoryId: 1, categoryCode: 'LAB', categoryName: 'Labour', totalSpend: 150000 }],
      monthlyTrend: [
        { month: '2026-09-01', actualSpend: 150000, forecast: null },
        { month: '2026-10-01', actualSpend: null, forecast: 15000 },
      ],
      alerts: [
        {
          projectId: 1,
          projectCode: '',
          projectName: '',
          alertType: 'OVERRUN_FORECAST',
          severity: 'critical',
          currentBudget: 220000,
          actualSpend: 150000,
          eac: 225000,
          utilization: 0.68,
        },
      ],
      currency: 'AED',
    },
  };
}

export function cost(overrides: Partial<Cost> = {}): Cost {
  return {
    id: 3,
    projectId: 1,
    categoryId: 3,
    categoryName: 'Hardware',
    txnDate: '2026-06-20',
    amount: 3000,
    signedAmount: 3000,
    description: 'Lab workstation quote',
    vendor: 'Brightline Hardware',
    status: 'draft',
    entryType: 'expense',
    reversesId: null,
    createdBy: 2,
    createdByName: 'Christelle Satterfield',
    postedBy: null,
    postedByName: null,
    postedAt: null,
    version: 1,
    createdAt: '2026-06-20T08:00:00.000Z',
    ...overrides,
  };
}

export const postedCost = cost({
  id: 7,
  description: 'Contractor invoice May',
  status: 'posted',
  postedBy: 2,
  postedByName: 'Christelle Satterfield',
  postedAt: '2026-05-31T10:00:00.000Z',
  version: 2,
});

export const reversalCost = cost({
  id: 8,
  description: 'Reversal: duplicate invoice',
  status: 'posted',
  entryType: 'reversal',
  reversesId: 5,
  amount: 500,
  signedAmount: -500,
  postedBy: 2,
  postedByName: 'Christelle Satterfield',
  postedAt: '2026-06-02T10:00:00.000Z',
});

export function budgetResponse(overrides: Partial<BudgetSummary> = {}) {
  return {
    data: {
      initialAmount: 200000,
      approvedRevisionsTotal: 20000,
      currentBudget: 220000,
      currency: 'AED',
      revisions: [
        {
          id: 1,
          projectId: 1,
          amount: 20000,
          rationale: 'Scope increase — additional integration work',
          status: 'approved',
          requestedBy: 2,
          requestedByName: 'Christelle Satterfield',
          decidedBy: 1,
          decidedByName: 'Garnet Wiegand',
          decidedAt: '2026-03-05T00:00:00.000Z',
          decisionReason: 'Approved — justified by added scope',
          effectiveDate: '2026-03-01',
          createdAt: '2026-03-02T00:00:00.000Z',
        },
      ],
      ...overrides,
    },
  };
}

export const forecastsResponse = {
  data: {
    forecasts: [
      {
        id: 1,
        projectId: 1,
        month: '2026-10-01',
        amount: 15000,
        updatedBy: 2,
        updatedAt: '2026-09-15T09:00:00.000Z',
      },
    ],
    forecastToComplete: 15000,
    currency: 'AED',
  },
};

export const categoriesResponse = {
  data: [
    { id: 1, code: 'LAB', name: 'Labour', isActive: true },
    { id: 3, code: 'HW', name: 'Hardware', isActive: true },
  ],
};
