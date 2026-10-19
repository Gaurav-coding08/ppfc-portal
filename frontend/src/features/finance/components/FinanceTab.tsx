import { useRef } from 'react';
import { isForbidden } from '@/api/errors';
import { ErrorState } from '@/components/data/ErrorState';
import { ForbiddenState } from '@/components/data/ForbiddenState';
import { LoadingState } from '@/components/data/LoadingState';
import { useReportingDate } from '@/components/layout/useReportingDate';
import type { ProjectDetail } from '@/features/projects/types';
import { formatDate } from '@/lib/format';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { useFinancialSummary } from '../hooks/useFinanceQueries';
import { COST_LIST_DEFAULTS } from '../types';
import { BudgetSection } from './BudgetSection';
import { CostsSection } from './CostsSection';
import { FinanceAlertsStrip } from './FinanceAlertsStrip';
import { FinanceCharts } from './FinanceCharts';
import { FinanceSummaryCards } from './FinanceSummaryCards';
import { ForecastGrid } from './ForecastGrid';

// The project's Finance tab. Every member can read it; managers
// (canManage — a UI hint, the backend re-checks) also get the write
// actions. Numbers are displayed exactly as the API returns them and are
// refetched after every write (see useInvalidateFinance).
export function FinanceTab({ project, canManage }: { project: ProjectDetail; canManage: boolean }) {
  const projectId = project.id!;
  const summary = useFinancialSummary(projectId);
  // The reporting date the backend used for every figure on this tab
  // (none of the requests sends `asOf`).
  const asOf = useReportingDate();
  const [costFilters, setCostFilters] = useUrlFilters(COST_LIST_DEFAULTS);
  const costsRef = useRef<HTMLElement>(null);

  // Drill-down: show the transactions behind the Actual spend number —
  // posted entries (reversals included) dated on or before the as-of date,
  // the same rows the backend sums.
  function showActualSpendRows() {
    if (!asOf) return;
    setCostFilters({ status: 'posted', to: asOf, from: '', categoryId: '', page: '1' });
    costsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  if (summary.isPending) return <LoadingState rows={6} />;
  if (summary.isError) {
    if (isForbidden(summary.error))
      return <ForbiddenState message="You don't have access to this project's finances." />;
    return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />;
  }

  const data = summary.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {asOf ? `Figures as of ${formatDate(asOf)} · ` : ''}
          {data.currency ?? 'AED'}
          {!canManage && ' · Read-only'}
        </p>
      </div>

      <FinanceAlertsStrip alerts={data.alerts ?? []} />
      <FinanceSummaryCards
        financials={data.financials!}
        onActualSpendClick={asOf ? showActualSpendRows : undefined}
      />
      <FinanceCharts spendByCategory={data.spendByCategory ?? []} monthlyTrend={data.monthlyTrend ?? []} />
      <BudgetSection projectId={projectId} canManage={canManage} />
      <CostsSection
        ref={costsRef}
        projectId={projectId}
        canManage={canManage}
        asOf={asOf}
        filters={costFilters}
        setFilters={setCostFilters}
      />
      <ForecastGrid project={project} canManage={canManage} asOf={asOf} />
    </div>
  );
}
