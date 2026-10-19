import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/data/EmptyState';
import { Card } from '@/components/ui/card';
import { formatDate, formatMoney } from '@/lib/format';
import type { MonthlyTrendRow, SpendByCategoryRow } from '../types';

// CLAUDE.md fixed chart palette: Actual indigo-600, Forecast teal-500
// (dashed). Grid and axes stay muted so the data carries the reading.
// Every plotted value is a number the API returned; the charts only draw.
const AXIS_TICK = { fontSize: 12, fill: 'var(--color-slate-500)' };
const GRID = 'var(--color-slate-200)';

// Compact axis labels ("AED 25K"); the tooltip shows the full amount.
const compactAed = new Intl.NumberFormat('en-AE', {
  style: 'currency',
  currency: 'AED',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function FinanceCharts({
  spendByCategory,
  monthlyTrend,
}: {
  spendByCategory: SpendByCategoryRow[];
  monthlyTrend: MonthlyTrendRow[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold">Actual spend by category</h2>
        <SpendByCategoryChart rows={spendByCategory} />
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="text-base font-semibold">Monthly actual vs forecast</h2>
        <MonthlyTrendChart rows={monthlyTrend} />
      </Card>
    </div>
  );
}

// One series (posted spend per category), so no legend — the card title
// names it.
function SpendByCategoryChart({ rows }: { rows: SpendByCategoryRow[] }) {
  if (rows.length === 0) {
    return <EmptyState icon={BarChart3} message="No posted spend up to the reporting date yet." />;
  }
  return (
    <div className="h-64" role="img" aria-label="Bar chart of actual spend by cost category">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="categoryName" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis
            tickFormatter={(v: number) => compactAed.format(v)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-slate-100)' }}
            formatter={(v) => [formatMoney(Number(v)), 'Actual spend']}
          />
          <Bar
            dataKey="totalSpend"
            name="Actual spend"
            fill="var(--color-indigo-600)"
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Months come back as YYYY-MM-01 strings for the whole project timeline;
// a null value is a gap (no posted spend / no forecast that month).
function MonthlyTrendChart({ rows }: { rows: MonthlyTrendRow[] }) {
  const hasData = rows.some((r) => r.actualSpend !== null || r.forecast !== null);
  if (!hasData) {
    return <EmptyState icon={BarChart3} message="No actual spend or forecast recorded yet." />;
  }
  return (
    <div className="h-64" role="img" aria-label="Line chart of monthly actual spend and forecast">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(d: string) => formatDate(d, 'MMM yy')}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => compactAed.format(v)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={72}
          />
          <Tooltip
            formatter={(v, name) => [v === null || v === undefined ? '—' : formatMoney(Number(v)), name]}
            labelFormatter={(d) => formatDate(String(d), 'MMMM yyyy')}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="actualSpend"
            name="Actual"
            stroke="var(--color-indigo-600)"
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: 'white' }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke="var(--color-teal-500)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={{ r: 4, strokeWidth: 2, fill: 'white' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
