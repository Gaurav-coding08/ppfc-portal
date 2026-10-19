import type { DrillTarget } from './drill';
import type { KpiKey } from './types';

// Display metadata for the KPI cards: label, section and the one-line
// definition shown in each card's tooltip. Definitions are condensed from
// docs/kpi-definitions.md (the SQL there is the source of truth). Values
// and units always come from GET /dashboard/kpis — nothing here computes.
//
// `drill`: KPIs whose records can be listed through a paginated drill
// endpoint (the `drill.endpoint` the API returns for that KPI). KPIs whose
// drill is a visual endpoint already on the page (project-health,
// budget-vs-actual) have no drawer; the chart/table below is their
// breakdown.

export interface KpiMeta {
  label: string;
  definition: string;
  drill?: DrillTarget;
}

export const KPI_META: Record<KpiKey, KpiMeta> = {
  totalProjects: {
    label: 'Total projects',
    definition: 'Projects in your scope that match the filters.',
  },
  activeProjects: {
    label: 'Active projects',
    definition: 'Projects with status "active" among the filtered projects.',
  },
  portfolioProgressPct: {
    label: 'Portfolio progress',
    definition: 'Weighted average task progress across the filtered projects (weighted by task count).',
  },
  taskCompletionPct: {
    label: 'Task completion',
    definition: 'Share of tasks with status "done", by due date within the timeframe.',
    drill: { kind: 'tasks', params: { kind: 'all' } },
  },
  overdueIncompleteTasks: {
    label: 'Overdue tasks',
    definition: 'Tasks not done whose due date is before the reporting date.',
    drill: { kind: 'tasks', params: { kind: 'overdue' } },
  },
  milestonesDue14d: {
    label: 'Milestones due in 14 days',
    definition: 'Planned milestones due between the reporting date and 14 days after it.',
  },
  openHighExposureRisks: {
    label: 'Open high-exposure risks',
    definition: 'Risks and issues not closed with a score (probability × impact) of 15 or more.',
    drill: { kind: 'risks', params: { kind: 'high-exposure' } },
  },
  blockedTasks: {
    label: 'Blocked tasks',
    definition: 'Tasks with status "blocked".',
    drill: { kind: 'tasks', params: { kind: 'blocked' } },
  },
  pendingChangeRequests: {
    label: 'Pending change requests',
    definition: 'Change requests in status "submitted", awaiting a decision.',
    drill: { kind: 'change-requests', params: {} },
  },
  approvedBudget: {
    label: 'Approved budget',
    definition: 'Initial approved budget plus approved budget revisions, as of the reporting date.',
  },
  actualSpend: {
    label: 'Actual spend',
    definition:
      'Posted cost transactions dated on or before the reporting date (reversals subtract). Drafts excluded.',
    drill: { kind: 'costs', params: {} },
  },
  remainingBudget: {
    label: 'Remaining budget',
    definition: 'Approved budget minus actual spend.',
  },
  utilizationPct: {
    label: 'Budget utilization',
    definition: 'Actual spend ÷ approved budget. Shown as "—" when the budget is 0.',
  },
  forecastEac: {
    label: 'Forecast EAC',
    definition: 'Estimate at completion: actual spend plus forecasts for months after the reporting month.',
  },
  projectedOverrunCount: {
    label: 'Projects over budget',
    definition: 'Projects whose EAC exceeds their approved budget.',
  },
  projectedOverrunAmount: {
    label: 'Projected overrun',
    definition: 'Sum of (EAC − approved budget) over projects whose EAC exceeds their budget.',
  },
};

// Card rows in display order (spec §A "three rows with section titles").
// projectedOverrunCount is rendered inside the Projected overrun card.
export const KPI_SECTIONS: { title: string; keys: KpiKey[]; finance: boolean }[] = [
  {
    title: 'Delivery',
    keys: [
      'totalProjects',
      'activeProjects',
      'portfolioProgressPct',
      'overdueIncompleteTasks',
      'milestonesDue14d',
    ],
    finance: false,
  },
  {
    title: 'Risk & governance',
    keys: ['openHighExposureRisks', 'blockedTasks', 'pendingChangeRequests'],
    finance: false,
  },
  {
    title: 'Financial',
    keys: [
      'approvedBudget',
      'actualSpend',
      'remainingBudget',
      'utilizationPct',
      'forecastEac',
      'projectedOverrunAmount',
    ],
    finance: true,
  },
];
