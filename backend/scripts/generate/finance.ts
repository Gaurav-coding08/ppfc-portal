import { PROJECTS } from './projects.js';
import { addDays, atTime, shiftTimestamp } from './dates.js';
import type { BudgetRevisionRow, CostCategoryRow, ProjectBudgetRow } from './types.js';

export function buildCostCategories(): CostCategoryRow[] {
  return [
    { id: 1, code: 'LAB', name: 'Labour' },
    { id: 2, code: 'LIC', name: 'Licences & Software' },
    { id: 3, code: 'HW', name: 'Hardware' },
    { id: 4, code: 'EXT', name: 'External Services' },
  ];
}

// Initial budget per project (id = project id, 1:1). Amounts are hand-picked
// so the budget_revisions and cost_transactions fixtures below land exactly
// on the utilization/EAC edge cases the feature spec requires — see
// docs/data-dictionary.md → "Edge-case catalogue".
const INITIAL_BUDGET_BY_PROJECT: Record<number, number> = {
  1: 200000, // no posted spend yet
  2: 150000, // near budget (90-99% utilization)
  3: 100000, // forecast to exceed budget
  4: 90000, // completed
  5: 80000, // no forecast rows (forecastMissing)
  6: 120000, // has a reversal entry
  7: 60000, // plain + 1 posted cost after the cutoff
  8: 50000, // plain
};

export function buildProjectBudgets(): ProjectBudgetRow[] {
  return PROJECTS.map((project) => ({
    id: project.id,
    project_id: project.id,
    initial_amount: INITIAL_BUDGET_BY_PROJECT[project.id]!,
    approved_by: 1, // admin
    approved_at: `${project.start_date}T00:00:00Z`,
  }));
}

// requested_by is always the project owner; decided_by is the admin so the
// self-approval CHECK (decided_by <> requested_by) is never at risk.
export function buildBudgetRevisions(): BudgetRevisionRow[] {
  const admin = 1;
  const rows: Omit<BudgetRevisionRow, 'id' | 'created_at'>[] = [
    {
      project_id: 1,
      amount: 20000,
      rationale: 'Scope increase — additional integration work',
      status: 'approved',
      requested_by: 2,
      decided_by: admin,
      decided_at: '2026-03-05T00:00:00Z',
      decision_reason: 'Approved — justified by added scope',
      effective_date: '2026-03-01',
    },
    {
      project_id: 2,
      amount: 10000,
      rationale: 'Additional site survey costs',
      status: 'approved',
      requested_by: 3,
      decided_by: admin,
      decided_at: '2026-02-04T00:00:00Z',
      decision_reason: 'Approved',
      effective_date: '2026-02-01',
    },
    {
      project_id: 3,
      amount: 15000,
      rationale: 'Extra licensing for the upgraded modules',
      status: 'pending',
      requested_by: 4,
      decided_by: null,
      decided_at: null,
      decision_reason: null,
      effective_date: '2026-08-01',
    },
    {
      project_id: 4,
      amount: 5000,
      rationale: 'Device testing lab costs',
      status: 'approved',
      requested_by: 2,
      decided_by: admin,
      decided_at: '2026-01-18T00:00:00Z',
      decision_reason: 'Approved',
      effective_date: '2026-01-15',
    },
    {
      project_id: 5,
      amount: -3000,
      rationale: 'Requested budget cut was not needed after re-scoping',
      status: 'rejected',
      requested_by: 3,
      decided_by: admin,
      decided_at: '2026-04-03T00:00:00Z',
      decision_reason: 'Insufficient justification',
      effective_date: '2026-04-01',
    },
    {
      project_id: 6,
      amount: 8000,
      rationale: 'Additional rack space at the target facility',
      status: 'approved',
      requested_by: 4,
      decided_by: admin,
      decided_at: '2026-05-04T00:00:00Z',
      decision_reason: 'Approved',
      effective_date: '2026-05-01',
    },
    {
      project_id: 7,
      amount: 12000,
      rationale: 'Design agency extension',
      status: 'pending',
      requested_by: 2,
      decided_by: null,
      decided_at: null,
      decision_reason: null,
      effective_date: '2026-09-01',
    },
    {
      project_id: 8,
      amount: 3000,
      rationale: 'MFA hardware tokens for pilot group',
      status: 'approved',
      requested_by: 3,
      decided_by: admin,
      decided_at: '2026-06-03T00:00:00Z',
      decision_reason: 'Approved',
      effective_date: '2026-06-01',
    },
  ];

  // created_at is when the revision was requested — always before its own
  // decision (decided ones) or a couple of weeks ahead of its effective
  // date (still-pending ones), and never after the reporting date.
  return rows.map((row, i) => ({
    id: i + 1,
    ...row,
    created_at: row.decided_at ? shiftTimestamp(row.decided_at, -3) : atTime(addDays(row.effective_date, -14)),
  }));
}
