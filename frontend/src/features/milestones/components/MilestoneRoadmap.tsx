import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Milestone } from '../types';

// Whole days since the epoch for a YYYY-MM-DD string, built from its
// year/month/day parts with Date.UTC — no `new Date(str)` and no local
// timezone involved, so the same date always lands on the same spot.
// Used only to *place* dots on the strip; no status or KPI is derived here.
function dayNumber(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

// Dot colour by status. Overdue (still planned, past due — the API's
// `isOverdue`) uses the danger colour like the table badge.
function dotClass(m: Milestone): string {
  if (m.status === 'achieved') return 'bg-emerald-600';
  if (m.status === 'missed' || m.isOverdue) return 'bg-rose-600';
  return 'bg-slate-400';
}

/**
 * A compact time axis from project start to end with one dot per
 * milestone and a marker for the reporting date. Visual summary only: the
 * table below carries the same information as text (dots aren't the only
 * way status is conveyed), and every dot has a title + accessible label.
 */
export function MilestoneRoadmap({
  milestones,
  startDate,
  endDate,
  asOf,
}: {
  milestones: Milestone[];
  startDate: string;
  endDate: string;
  asOf?: string;
}) {
  const start = dayNumber(startDate);
  const span = Math.max(dayNumber(endDate) - start, 1);
  // Clamped so a date just outside the project window still sits on the strip.
  const position = (date: string) => `${Math.min(Math.max((dayNumber(date) - start) / span, 0), 1) * 100}%`;

  return (
    <figure className="rounded-xl border bg-white p-5 shadow-sm">
      <figcaption className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-semibold">Roadmap</span>
        <span className="text-muted-foreground flex flex-wrap gap-3 text-xs">
          <Legend className="bg-slate-400" label="Planned" />
          <Legend className="bg-emerald-600" label="Achieved" />
          <Legend className="bg-rose-600" label="Missed / overdue" />
        </span>
      </figcaption>

      <div className="relative mx-2 h-10">
        <div className="absolute top-1/2 right-0 left-0 h-0.5 -translate-y-1/2 rounded bg-slate-200" />
        {asOf && (
          <div
            className="absolute top-0 bottom-0 w-px bg-indigo-600"
            style={{ left: position(asOf) }}
            title={`Reporting date ${formatDate(asOf)}`}
            aria-hidden
          />
        )}
        <ul aria-label="Milestones on the project timeline">
          {milestones.map((m) =>
            m.dueDate ? (
              <li
                key={m.id}
                className={cn(
                  'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white',
                  dotClass(m),
                )}
                style={{ left: position(m.dueDate) }}
                title={`${m.name} — ${formatDate(m.dueDate)}`}
              >
                <span className="sr-only">
                  {m.name}, due {formatDate(m.dueDate)}, {m.status}
                </span>
              </li>
            ) : null,
          )}
        </ul>
      </div>

      <div className="text-muted-foreground mt-2 flex justify-between text-xs tabular-nums">
        <span>{formatDate(startDate)}</span>
        {asOf && <span className="text-indigo-600">Reporting date {formatDate(asOf)}</span>}
        <span>{formatDate(endDate)}</span>
      </div>
    </figure>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-full', className)} aria-hidden />
      {label}
    </span>
  );
}
