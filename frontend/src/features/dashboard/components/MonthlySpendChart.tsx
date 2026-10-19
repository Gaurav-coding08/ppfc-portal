import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_TICK, GRID, SERIES, compactAed, moneyTooltip } from '@/components/display/chartTheme';
import { formatDate } from '@/lib/format';
import type { MonthlySpendRow } from '../types';

// Months come back as YYYY-MM-01; a null value is a gap (no posted spend or
// no forecast that month).
export function MonthlySpendChart({ rows }: { rows: MonthlySpendRow[] }) {
  return (
    <div className="h-72" role="img" aria-label="Line chart of monthly actual spend and forecast">
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
            formatter={(v, name) => [moneyTooltip(v), name]}
            labelFormatter={(d) => formatDate(String(d), 'MMMM yyyy')}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="actualSpend"
            name="Actual"
            stroke={SERIES.actual}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 2, fill: 'white' }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke={SERIES.forecast}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={{ r: 3, strokeWidth: 2, fill: 'white' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
