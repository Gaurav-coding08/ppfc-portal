import { CalendarDays } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { useReportingDate } from '@/components/layout/useReportingDate';
import { formatDate } from '@/lib/format';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { DashboardFilterBar } from '../components/DashboardFilterBar';
import { MilestoneTimeline, OverdueByOwnerChart, ProjectHealthTable } from '../components/DeliveryVisuals';
import { DrillDrawer } from '../components/DrillDrawer';
import { BudgetVsActualChart, SpendByCategoryChart } from '../components/FinanceVisuals';
import { MonthlySpendChart } from '../components/MonthlySpendChart';
import { KpiSections } from '../components/KpiSections';
import { LastUpdated } from '../components/LastUpdated';
import { RiskMatrix } from '../components/RiskMatrix';
import { Widget } from '../components/Widget';
import type { DrillRequest } from '../drill';
import {
  useBudgetVsActual,
  useDashboardKpis,
  useMonthlySpend,
  useOverdueByOwner,
  useProjectHealth,
  useRiskMatrix,
  useSpendByCategory,
  useUpcomingMilestones,
} from '../hooks/useDashboardQueries';
import { DASHBOARD_FILTER_DEFAULTS, categoryApplied, toDashboardQuery } from '../types';

const MILESTONE_WINDOW_DAYS = 90;

const CLEARED = Object.fromEntries(Object.keys(DASHBOARD_FILTER_DEFAULTS).map((k) => [k, ''])) as Record<
  keyof typeof DASHBOARD_FILTER_DEFAULTS,
  string
>;

/**
 * Executive dashboard (module 06). Every number is computed by the
 * backend's dashboard endpoints on each request; this page only displays
 * them. Each widget has its own query (independent loading/error), and
 * all of them live under the `dashboard` query key, which every mutation
 * hook in the app invalidates — so after a task update or cost posting the
 * dashboard refetches instead of patching numbers.
 */
export function DashboardPage() {
  const [filters, setFilters] = useUrlFilters(DASHBOARD_FILTER_DEFAULTS);
  const query = useMemo(() => toDashboardQuery(filters), [filters]);
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const reset = useCallback(() => setFilters(CLEARED), [setFilters]);

  const kpis = useDashboardKpis(query);
  const budgetVsActual = useBudgetVsActual(query);
  const monthly = useMonthlySpend(query);
  const byCategory = useSpendByCategory(query);
  const riskMatrix = useRiskMatrix(query);
  const overdue = useOverdueByOwner(query);
  const health = useProjectHealth(query);
  const milestones = useUpcomingMilestones(query, MILESTONE_WINDOW_DAYS);

  // The reporting date comes from the backend (app_settings); the
  // timeframe filter never changes it.
  const reportingDate = useReportingDate();
  const asOf = kpis.data?.meta.asOf ?? reportingDate;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Portfolio delivery, risk and finance. Every figure is computed live by the server."
        action={<LastUpdated generatedAt={kpis.data?.meta.generatedAt} />}
      />

      {asOf && (
        <div className="flex items-start gap-2 text-sm">
          <CalendarDays className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium text-slate-900">Reporting date: {formatDate(asOf)}</span>{' '}
            <span className="text-muted-foreground">
              · Financial figures are as of this date; the timeframe filter narrows tasks, milestones and
              change requests by date.
            </span>
          </p>
        </div>
      )}

      <DashboardFilterBar filters={filters} setFilters={setFilters} asOf={asOf} />

      <KpiSections query={kpis} onDrill={setDrill} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Widget
          title="Budget vs actual vs EAC by project"
          description="AED · click a project to see its posted costs"
          query={budgetVsActual}
          isEmpty={(rows) => rows.length === 0}
          onReset={reset}
          className="xl:col-span-2"
        >
          {(rows, meta) => (
            <BudgetVsActualChart rows={rows} includeCategory={categoryApplied(meta)} onDrill={setDrill} />
          )}
        </Widget>

        <Widget
          title="Monthly cost trend"
          description="AED · actual vs forecast per month"
          query={monthly}
          isEmpty={(rows) => rows.every((r) => r.actualSpend === null && r.forecast === null)}
          onReset={reset}
        >
          {(rows) => <MonthlySpendChart rows={rows} />}
        </Widget>

        <Widget
          title="Spend by category"
          description="AED · posted costs up to the reporting date"
          query={byCategory}
          isEmpty={(rows) => rows.length === 0}
          onReset={reset}
        >
          {(rows, meta) => (
            <SpendByCategoryChart rows={rows} includeCategory={categoryApplied(meta)} onDrill={setDrill} />
          )}
        </Widget>

        <Widget
          title="Risk matrix"
          description="Open risks by probability × impact · click a cell to list them"
          query={riskMatrix}
          isEmpty={(data) => data.totalOpenRisks === 0}
          onReset={reset}
        >
          {(data) => <RiskMatrix data={data} onDrill={setDrill} />}
        </Widget>

        <Widget
          title="Overdue work by owner"
          description="Incomplete tasks past due · click a bar to list them"
          query={overdue}
          isEmpty={(rows) => rows.length === 0}
          onReset={reset}
        >
          {(rows) => <OverdueByOwnerChart rows={rows} onDrill={setDrill} />}
        </Widget>

        <Widget
          title="Project health"
          query={health}
          isEmpty={(rows) => rows.length === 0}
          onReset={reset}
          className="xl:col-span-2"
        >
          {(rows) => <ProjectHealthTable rows={rows} onDrill={setDrill} />}
        </Widget>

        <Widget
          title="Milestone roadmap"
          description={`Planned milestones due in the next ${MILESTONE_WINDOW_DAYS} days`}
          query={milestones}
          isEmpty={(rows) => rows.length === 0}
          onReset={reset}
          className="xl:col-span-2"
        >
          {(rows) => <MilestoneTimeline rows={rows} withinDays={MILESTONE_WINDOW_DAYS} />}
        </Widget>
      </div>

      <DrillDrawer request={drill} query={query} onClose={() => setDrill(null)} />
    </div>
  );
}
