import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AXIS_TICK,
  CATEGORY_COLORS,
  GRID,
  SERIES,
  compactAed,
  moneyTooltip,
} from '@/components/display/chartTheme';
import { Money } from '@/components/display/Money';
import type { DrillRequest } from '../drill';
import type { BudgetVsActualRow, CategorySpendRow } from '../types';

// Dashboard finance charts. Every plotted value is a number from the API;
// the overrun highlight uses the API's `isOverrun` flag (fn_project_financials),
// so the browser never compares EAC with budget itself. Clicking a bar opens
// the posted-cost records behind it.

function SwatchLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function BudgetVsActualChart({
  rows,
  includeCategory,
  onDrill,
}: {
  rows: BudgetVsActualRow[];
  includeCategory: boolean;
  onDrill: (request: DrillRequest) => void;
}) {
  const overrun = rows.filter((r) => r.isOverrun);

  // A click on any of a project's three bars lists that project's posted costs.
  const drill = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onDrill({
      kind: 'costs',
      params: { drillProjectId: row.projectId },
      title: `Actual spend — ${row.code}`,
      includeCategory,
      reconcile: { label: `Actual spend ${row.code}`, value: <Money amount={row.actualSpend} /> },
    });
  };

  return (
    <div className="space-y-3">
      <div
        className="h-72"
        role="img"
        aria-label="Grouped bar chart of approved budget, actual spend and EAC per project"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="code" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
            <YAxis
              tickFormatter={(v: number) => compactAed.format(v)}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip
              cursor={{ fill: 'var(--color-slate-100)' }}
              formatter={(v, name) => [moneyTooltip(v), name]}
              labelFormatter={(code) => {
                const row = rows.find((r) => r.code === code);
                return row
                  ? `${row.code} — ${row.name}${row.isOverrun ? ' (projected overrun)' : ''}`
                  : String(code);
              }}
            />
            <Bar
              dataKey="currentBudget"
              name="Approved budget"
              fill={SERIES.budget}
              maxBarSize={20}
              isAnimationActive={false}
              onClick={(_, i) => drill(i)}
              className="cursor-pointer"
            />
            <Bar
              dataKey="actualSpend"
              name="Actual"
              fill={SERIES.actual}
              maxBarSize={20}
              isAnimationActive={false}
              onClick={(_, i) => drill(i)}
              className="cursor-pointer"
            />
            <Bar
              dataKey="eac"
              name="EAC"
              maxBarSize={20}
              isAnimationActive={false}
              onClick={(_, i) => drill(i)}
              className="cursor-pointer"
            >
              {rows.map((r) => (
                <Cell key={r.projectId} fill={r.isOverrun ? SERIES.overrun : SERIES.eac} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SwatchLegend
        items={[
          { label: 'Approved budget', color: SERIES.budget },
          { label: 'Actual', color: SERIES.actual },
          { label: 'EAC', color: SERIES.eac },
          { label: 'EAC over budget', color: SERIES.overrun },
        ]}
      />
      {/* The overrun highlight in words too — never colour alone. */}
      <p className="text-xs text-slate-700">
        {overrun.length === 0
          ? 'No project is projected over budget.'
          : `Projected over budget: ${overrun.map((r) => r.code).join(', ')}`}
      </p>
    </div>
  );
}

export function SpendByCategoryChart({
  rows,
  includeCategory,
  onDrill,
}: {
  rows: CategorySpendRow[];
  includeCategory: boolean;
  onDrill: (request: DrillRequest) => void;
}) {
  const drill = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onDrill({
      kind: 'costs',
      params: { drillCategoryId: row.categoryId },
      title: `Actual spend — ${row.categoryName}`,
      includeCategory,
      reconcile: { label: row.categoryName, value: <Money amount={row.totalSpend} /> },
    });
  };

  return (
    <div
      style={{ height: Math.max(rows.length * 44, 160) }}
      role="img"
      aria-label="Horizontal bar chart of actual spend by cost category"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => compactAed.format(v)}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="categoryName"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={130}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-slate-100)' }}
            formatter={(v) => [moneyTooltip(v), 'Actual spend']}
          />
          <Bar
            dataKey="totalSpend"
            name="Actual spend"
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
            isAnimationActive={false}
            onClick={(_, i) => drill(i)}
            className="cursor-pointer"
          >
            {rows.map((r, i) => (
              <Cell key={r.categoryId} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
