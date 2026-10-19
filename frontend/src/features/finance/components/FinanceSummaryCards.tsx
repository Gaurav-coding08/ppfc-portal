import { KpiCard } from '@/components/display/KpiCard';
import { Money } from '@/components/display/Money';
import { Percent } from '@/components/display/Percent';
import { cn } from '@/lib/cn';
import { KPI_DEFINITIONS, type ProjectFinancials } from '../types';

// The seven KPIs exactly as `GET /financial-summary` returns them —
// nothing is added, subtracted or divided here. Negative remaining budget
// or variance is shown in the danger colour, with the minus sign carrying
// the meaning for anyone who can't see the colour.
//
// `onActualSpendClick`: the drill-down to the posted transactions behind
// the actual-spend number.
export function FinanceSummaryCards({
  financials,
  onActualSpendClick,
}: {
  financials: ProjectFinancials;
  onActualSpendClick?: () => void;
}) {
  const negative = (v: number | undefined) => (v !== undefined && v < 0 ? 'text-rose-600' : undefined);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Current approved budget"
        hint={KPI_DEFINITIONS.currentBudget}
        value={<Money amount={financials.currentBudget ?? null} />}
      />
      <KpiCard
        label="Actual spend"
        hint={KPI_DEFINITIONS.actualSpend}
        value={<Money amount={financials.actualSpend ?? null} />}
        onClick={onActualSpendClick}
        actionLabel="Actual spend: show the posted transactions behind this number"
      />
      <KpiCard
        label="Remaining budget"
        hint={KPI_DEFINITIONS.remainingBudget}
        value={
          <Money
            amount={financials.remainingBudget ?? null}
            className={negative(financials.remainingBudget)}
          />
        }
      />
      <KpiCard
        label="Utilization"
        hint={KPI_DEFINITIONS.utilization}
        // null when the budget is 0 (CLAUDE.md) → "—"
        value={<Percent kind="ratio" value={financials.utilization} />}
      />
      <KpiCard
        label="Forecast to complete"
        hint={KPI_DEFINITIONS.forecastToComplete}
        value={<Money amount={financials.forecastToComplete ?? null} />}
      />
      <KpiCard label="EAC" hint={KPI_DEFINITIONS.eac} value={<Money amount={financials.eac ?? null} />} />
      <KpiCard
        label="Projected variance"
        hint={KPI_DEFINITIONS.projectedVariance}
        className={cn(financials.isOverrun && 'ring-1 ring-rose-200')}
        value={
          <Money
            amount={financials.projectedVariance ?? null}
            className={negative(financials.projectedVariance)}
          />
        }
      />
    </div>
  );
}
