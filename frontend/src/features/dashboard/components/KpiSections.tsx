import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/data/ErrorState';
import { KpiCard } from '@/components/display/KpiCard';
import { Money } from '@/components/display/Money';
import { Percent } from '@/components/display/Percent';
import { Skeleton } from '@/components/ui/skeleton';
import type { DrillRequest } from '../drill';
import { KPI_META, KPI_SECTIONS } from '../kpiCatalog';
import { categoryApplied, type Kpi, type KpiKey, type WidgetResult } from '../types';
import { CategoryChip } from './Widget';

/** A KPI value with its unit, exactly as the API returned it. */
// `compact` on cards; the drill drawer shows the exact amount to reconcile.
export function KpiValue({ kpi, compact = false }: { kpi: Kpi; compact?: boolean }) {
  if (kpi.unit === 'AED') return <Money amount={kpi.value} compact={compact} />;
  if (kpi.unit === 'pct') return <Percent value={kpi.value} digits={1} />;
  return <span className="tabular-nums">{kpi.value ?? '—'}</span>;
}

export function KpiSections({
  query,
  onDrill,
}: {
  query: UseQueryResult<WidgetResult<Kpi[]>>;
  onDrill: (request: DrillRequest) => void;
}) {
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const byKey = new Map<KpiKey, Kpi>((query.data?.data ?? []).map((k) => [k.key, k]));
  const meta = query.data?.meta;

  function card(key: KpiKey): ReactNode {
    const kpi = byKey.get(key);
    const info = KPI_META[key];
    if (!kpi)
      return <Skeleton key={key} className="h-[104px] rounded-xl" aria-label={`Loading ${info.label}`} />;

    let value: ReactNode = <KpiValue kpi={kpi} compact />;
    // The overrun card shows both overrun KPIs: the amount, and how many
    // projects it comes from.
    if (key === 'projectedOverrunAmount') {
      const count = byKey.get('projectedOverrunCount');
      value = (
        <>
          <KpiValue kpi={kpi} compact />
          {count && (
            <span className="text-muted-foreground block text-xs font-medium">
              {count.value} {count.value === 1 ? 'project' : 'projects'} over budget
            </span>
          )}
        </>
      );
    }

    const drill = info.drill;
    return (
      <KpiCard
        key={key}
        label={info.label}
        value={value}
        hint={info.definition}
        onClick={
          drill
            ? () =>
                onDrill({
                  ...drill,
                  title: info.label,
                  includeCategory: categoryApplied(meta),
                  reconcile: { label: info.label, value: <KpiValue kpi={kpi} /> },
                })
            : undefined
        }
        actionLabel={drill ? `${info.label}: show records` : undefined}
      />
    );
  }

  return (
    <div className="space-y-6">
      {KPI_SECTIONS.map((section) => (
        <section key={section.title} aria-label={section.title} className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">{section.title}</h2>
            <CategoryChip meta={meta} />
          </div>
          {/* auto-fill: rows have 5, 3 and 6 cards; this stacks to one column on phones. */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {section.keys.map(card)}
          </div>
        </section>
      ))}
    </div>
  );
}
