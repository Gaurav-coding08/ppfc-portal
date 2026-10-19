import { LineChart as LineChartIcon } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { formatDate, formatPercent } from '@/lib/format';
import { useProgressSnapshots } from '../hooks/useProjectQueries';

// One series (progress % per month-end snapshot), so no legend — the card
// title names it. Indigo is the design system's primary/"Actual" colour;
// grid and axes stay muted so the line carries the reading. Snapshot dates
// are YYYY-MM-DD strings formatted with formatDate (never `new Date(str)`).
export function ProgressHistoryChart({ projectId }: { projectId: number }) {
  const snapshots = useProgressSnapshots(projectId);

  if (snapshots.isPending) return <LoadingState rows={3} />;
  if (snapshots.isError) return <ErrorState error={snapshots.error} onRetry={() => snapshots.refetch()} />;
  if (snapshots.data.length === 0) {
    return <EmptyState icon={LineChartIcon} message="No progress snapshots recorded yet." />;
  }

  return (
    <div className="h-56" role="img" aria-label="Progress history line chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={snapshots.data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="var(--color-slate-200)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="snapshotDate"
            tickFormatter={(d: string) => formatDate(d, 'MMM yy')}
            tick={{ fontSize: 12, fill: 'var(--color-slate-500)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 12, fill: 'var(--color-slate-500)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v) => [formatPercent(Number(v)), 'Progress']}
            labelFormatter={(d) => formatDate(String(d))}
          />
          <Line
            type="monotone"
            dataKey="progressPct"
            stroke="var(--color-indigo-600)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: 'white' }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
