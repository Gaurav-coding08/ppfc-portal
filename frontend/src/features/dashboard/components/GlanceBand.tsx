import { AlertTriangle } from 'lucide-react';
import { Money } from '@/components/display/Money';
import { Percent } from '@/components/display/Percent';
import { DateText } from '@/components/display/DateText';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import type { Kpi, KpiKey } from '../types';

function pick(kpis: Map<KpiKey, Kpi>, key: KpiKey) {
  return kpis.get(key)?.value ?? null;
}

export function GlanceBand({ kpis, asOf }: { kpis: Kpi[] | undefined; asOf: string | undefined }) {
  if (!kpis) {
    return <Skeleton className="h-16 w-full rounded-xl" aria-label="Loading portfolio summary" />;
  }

  const byKey = new Map<KpiKey, Kpi>(kpis.map((k) => [k.key, k]));
  const utilization = pick(byKey, 'utilizationPct');
  const overrunCount = pick(byKey, 'projectedOverrunCount');

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-white px-5 py-3">
      {asOf && (
        <div className="text-muted-foreground text-xs">
          As of <DateText value={asOf} />
        </div>
      )}

      <Stat label="Approved budget" value={<Money compact amount={pick(byKey, 'approvedBudget')} />} />
      <Stat label="Actual spend" value={<Money compact amount={pick(byKey, 'actualSpend')} />} />
      <Stat label="Forecast EAC" value={<Money compact amount={pick(byKey, 'forecastEac')} />} />

      {overrunCount !== null && overrunCount > 0 && (
        <div className="flex items-center gap-1.5 text-sm">
          <AlertTriangle className="size-4 text-rose-600" aria-hidden />
          <span className="font-medium text-rose-700">
            {overrunCount} {overrunCount === 1 ? 'project' : 'projects'} over budget
          </span>
        </div>
      )}

      {utilization !== null && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Utilisation</span>
          <Progress value={utilization} className="h-2 w-24" />
          <Percent value={utilization} kind="percent" className="text-xs font-medium tabular-nums" />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-[11px] font-medium">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
