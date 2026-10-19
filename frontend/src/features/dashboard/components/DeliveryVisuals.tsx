import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_TICK, GRID, SERIES } from '@/components/display/chartTheme';
import { Percent } from '@/components/display/Percent';
import { ProgressBar } from '@/components/display/ProgressBar';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ToneBadge } from '@/components/display/ToneBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { DrillRequest } from '../drill';
import type { DashboardMilestone, OverdueOwnerRow, ProjectHealthRow } from '../types';

export function OverdueByOwnerChart({
  rows,
  onDrill,
}: {
  rows: OverdueOwnerRow[];
  onDrill: (request: DrillRequest) => void;
}) {
  const data = rows.map((r) => ({ ...r, label: r.assigneeName ?? 'Unassigned' }));

  // drill/tasks filters by `ownerId`; unassigned tasks have none, so that
  // bar isn't clickable.
  const drill = (index: number) => {
    const row = rows[index];
    if (!row || row.assigneeId === null) return;
    onDrill({
      kind: 'tasks',
      params: { kind: 'overdue', ownerId: row.assigneeId },
      title: `Overdue tasks — ${row.assigneeName}`,
      includeCategory: false,
      reconcile: { label: `Overdue for ${row.assigneeName}`, value: row.count },
    });
  };

  return (
    <div
      style={{ height: Math.max(data.length * 32, 160) }}
      role="img"
      aria-label="Bar chart of overdue incomplete tasks per assignee"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 16, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Overdue tasks (count)', position: 'insideBottom', offset: -8, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={150}
            interval={0}
          />
          <Tooltip cursor={{ fill: 'var(--color-slate-100)' }} formatter={(v) => [v, 'Overdue tasks']} />
          <Bar
            dataKey="count"
            name="Overdue tasks"
            fill={SERIES.overrun}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
            onClick={(_, i) => drill(i)}
            className="cursor-pointer"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Per-project status, progress, utilization and overdue/high-risk counts with badges. */
export function ProjectHealthTable({
  rows,
  onDrill,
}: {
  rows: ProjectHealthRow[];
  onDrill: (request: DrillRequest) => void;
}) {
  return (
    // Scrolls horizontally inside the card on narrow screens.
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Delivery</TableHead>
            <TableHead className="min-w-36">Progress</TableHead>
            <TableHead className="text-right">Utilization</TableHead>
            <TableHead className="text-right">Overdue tasks</TableHead>
            <TableHead className="text-right">High risks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.projectId} className="h-11">
              <TableCell>
                <Link to={`/projects/${r.projectId}`} className="text-primary font-medium hover:underline">
                  {r.code}
                </Link>
                <span className="text-muted-foreground block max-w-56 truncate text-xs">{r.name}</span>
              </TableCell>
              <TableCell>
                <StatusBadge domain="project" status={r.status} />
              </TableCell>
              <TableCell>
                <StatusBadge domain="delivery" status={r.deliveryStatus} />
              </TableCell>
              <TableCell>
                <ProgressBar value={r.progressPct} />
              </TableCell>
              <TableCell className="text-right">
                <Percent value={r.utilization} kind="ratio" />
              </TableCell>
              <TableCell className="text-right">
                {r.overdueTasks > 0 ? (
                  <button
                    type="button"
                    className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    aria-label={`${r.code}: show ${r.overdueTasks} overdue tasks`}
                    onClick={() =>
                      onDrill({
                        kind: 'tasks',
                        params: { kind: 'overdue', drillProjectId: r.projectId },
                        title: `Overdue tasks — ${r.code}`,
                        includeCategory: false,
                        reconcile: { label: `Overdue in ${r.code}`, value: r.overdueTasks },
                      })
                    }
                  >
                    <ToneBadge tone="danger" className="cursor-pointer tabular-nums">
                      {r.overdueTasks} overdue
                    </ToneBadge>
                  </button>
                ) : (
                  <span className="text-muted-foreground tabular-nums">0</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {r.openHighRisks > 0 ? (
                  <ToneBadge tone="danger" className="tabular-nums">
                    {r.openHighRisks} high
                  </ToneBadge>
                ) : (
                  <span className="text-muted-foreground tabular-nums">0</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Planned milestones due in the next `withinDays` days. Dots are placed by
 * the API's `daysToDue` (no date maths in the browser); the list below
 * repeats every milestone as text.
 */
export function MilestoneTimeline({ rows, withinDays }: { rows: DashboardMilestone[]; withinDays: number }) {
  const position = (days: number) => `${Math.min(Math.max(days / withinDays, 0), 1) * 100}%`;
  return (
    <div className="space-y-4">
      <div className="relative mx-2 h-6" aria-hidden>
        <div className="absolute top-1/2 right-0 left-0 h-px bg-slate-200" />
        {rows.map((m) => (
          <span
            key={m.id}
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600 ring-2 ring-white"
            style={{ left: position(m.daysToDue) }}
            title={`${m.projectCode} ${m.name} — ${formatDate(m.dueDate)}`}
          />
        ))}
      </div>
      <div className="text-muted-foreground -mt-3 flex justify-between text-xs">
        <span>Reporting date</span>
        <span>+{withinDays} days</span>
      </div>
      <ul className="divide-y text-sm">
        {rows.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <Link
                to={`/projects/${m.projectId}?tab=milestones`}
                className="text-primary font-medium hover:underline"
              >
                {m.projectCode}
              </Link>{' '}
              <span className="text-slate-700">{m.name}</span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {formatDate(m.dueDate)} · in {m.daysToDue} days
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
