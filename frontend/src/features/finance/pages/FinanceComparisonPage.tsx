import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { FilterBar } from '@/components/data/FilterBar';
import { FilterMultiSelect } from '@/components/data/FilterMultiSelect';
import { LoadingState } from '@/components/data/LoadingState';
import { Money } from '@/components/display/Money';
import { Percent } from '@/components/display/Percent';
import { ToneBadge } from '@/components/display/ToneBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProjectFilterOptions, useProjectLabel } from '@/features/projects/hooks/useReferenceData';
import { formatMoney } from '@/lib/format';
import { useUrlFilters } from '@/lib/useUrlFilters';
import { useFinanceComparison } from '../hooks/useFinanceQueries';
import type { ProjectFinancials } from '../types';

const MAX_PROJECTS = 10; // backend comparisonQuerySchema .max(10)
const COMPARISON_DEFAULTS = { projectIds: '' };

const compactAed = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  notation: 'compact',
  maximumFractionDigits: 1,
});

// Rows of the side-by-side table: label + how to read the value off one
// project's financials. Every value is the API's.
const METRICS: { label: string; render: (f: ProjectFinancials) => React.ReactNode }[] = [
  { label: 'Current approved budget', render: (f) => <Money amount={f.currentBudget ?? null} /> },
  { label: 'Actual spend', render: (f) => <Money amount={f.actualSpend ?? null} /> },
  { label: 'Remaining budget', render: (f) => <Money amount={f.remainingBudget ?? null} /> },
  { label: 'Utilization', render: (f) => <Percent kind="ratio" value={f.utilization} /> },
  { label: 'Forecast to complete', render: (f) => <Money amount={f.forecastToComplete ?? null} /> },
  { label: 'EAC', render: (f) => <Money amount={f.eac ?? null} /> },
  { label: 'Projected variance', render: (f) => <Money amount={f.projectedVariance ?? null} /> },
  {
    label: 'Flags',
    render: (f) => (
      <div className="flex flex-wrap gap-1">
        {f.isOverrun && <ToneBadge tone="danger">Overrun</ToneBadge>}
        {f.isNearBudget && <ToneBadge tone="warning">Near budget</ToneBadge>}
        {f.forecastMissing && <ToneBadge tone="info">No forecast</ToneBadge>}
        {!f.isOverrun && !f.isNearBudget && !f.forecastMissing && (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    ),
  },
];

// The selection lives in the URL (`?projectIds=1,4`) so a comparison can be
// shared. The picker lists the caller's projects; the backend still drops
// any id it won't show and reports it in `excluded`.
export function FinanceComparisonPage() {
  const [filters, setFilters] = useUrlFilters(COMPARISON_DEFAULTS);
  const options = useProjectFilterOptions();
  const projectLabel = useProjectLabel();
  const selectedIds = filters.projectIds
    ? filters.projectIds
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
    : [];
  const ids = selectedIds.slice(0, MAX_PROJECTS);
  const comparison = useFinanceComparison(ids);

  function onSelect(value: string) {
    const next = value ? value.split(',') : [];
    setFilters({ projectIds: next.slice(0, MAX_PROJECTS).join(',') });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance comparison"
        description={`Compare budget, actual spend and EAC side by side for up to ${MAX_PROJECTS} projects.`}
      />
      <FilterBar>
        <FilterMultiSelect
          label="Projects"
          allLabel="Choose projects"
          value={ids.join(',')}
          onChange={onSelect}
          options={options.data?.projects ?? []}
        />
        <span className="text-muted-foreground text-sm">
          {ids.length} of {MAX_PROJECTS} selected
        </span>
      </FilterBar>

      {ids.length === 0 ? (
        <EmptyState icon={BarChart3} message="Choose one or more projects to compare." />
      ) : comparison.isPending ? (
        <LoadingState rows={6} />
      ) : comparison.isError ? (
        <ErrorState error={comparison.error} onRetry={() => comparison.refetch()} />
      ) : (
        <div className="space-y-4">
          {comparison.data.excluded.length > 0 && (
            <p
              role="status"
              className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 ring-1 ring-amber-200"
            >
              Not shown (not found or no access): {comparison.data.excluded.map(projectLabel).join(', ')}
            </p>
          )}
          {comparison.data.projects.length > 0 && (
            <>
              <Card className="space-y-3 p-5">
                <h2 className="text-base font-semibold">Budget vs actual vs EAC</h2>
                <ComparisonChart projects={comparison.data.projects} projectLabel={projectLabel} />
              </Card>
              <Card className="p-0">
                <div className="overflow-x-auto">
                  <Table aria-label="Project financials side by side">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-5">Metric</TableHead>
                        {comparison.data.projects.map((p) => (
                          <TableHead key={p.projectId} className="text-right">
                            <Link
                              to={`/projects/${p.projectId}?tab=finance`}
                              className="text-primary hover:underline"
                            >
                              {projectLabel(p.projectId!).split(' — ')[0]}
                            </Link>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {METRICS.map((metric) => (
                        <TableRow key={metric.label}>
                          <TableCell className="text-muted-foreground pl-5 font-medium whitespace-nowrap">
                            {metric.label}
                          </TableCell>
                          {comparison.data.projects.map((p) => (
                            <TableCell key={p.projectId} className="text-right whitespace-nowrap">
                              <div className="flex justify-end">{metric.render(p)}</div>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Grouped bars with the CLAUDE.md fixed series colours: Budget slate-400,
// Actual indigo-600, EAC amber-500. Three series, so a legend is shown.
function ComparisonChart({
  projects,
  projectLabel,
}: {
  projects: ProjectFinancials[];
  projectLabel: (id: number) => string;
}) {
  const data = projects.map((p) => ({
    code: projectLabel(p.projectId!).split(' — ')[0],
    currentBudget: p.currentBudget,
    actualSpend: p.actualSpend,
    eac: p.eac,
  }));
  return (
    <div
      className="h-72"
      role="img"
      aria-label="Grouped bar chart of budget, actual spend and EAC per project"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barGap={2}>
          <CartesianGrid stroke="var(--color-slate-200)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="code"
            tick={{ fontSize: 12, fill: 'var(--color-slate-500)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => compactAed.format(v)}
            tick={{ fontSize: 12, fill: 'var(--color-slate-500)' }}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-slate-100)' }}
            formatter={(v, name) => [formatMoney(Number(v)), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="currentBudget"
            name="Budget"
            fill="var(--color-slate-400)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            isAnimationActive={false}
          />
          <Bar
            dataKey="actualSpend"
            name="Actual"
            fill="var(--color-indigo-600)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            isAnimationActive={false}
          />
          <Bar
            dataKey="eac"
            name="EAC"
            fill="var(--color-amber-500)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
