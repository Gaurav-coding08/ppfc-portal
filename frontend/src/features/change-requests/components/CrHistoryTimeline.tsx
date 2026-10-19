import { ArrowRight } from 'lucide-react';
import { DateText } from '@/components/display/DateText';
import { StatusBadge } from '@/components/display/StatusBadge';
import type { ChangeHistoryEntry } from '../types';

// The CR's status history exactly as the API returns it (oldest first).
// The first entry has no `fromStatus` — it is the original submission.
export function CrHistoryTimeline({ history }: { history: ChangeHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-muted-foreground text-sm">No history recorded.</p>;
  }
  return (
    <ol aria-label="Status history" className="space-y-4">
      {history.map((entry) => (
        <li key={entry.id} className="relative border-l pl-4">
          <span className="bg-primary absolute top-1.5 -left-1 size-2 rounded-full" aria-hidden />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {entry.fromStatus ? (
              <>
                <StatusBadge domain="changeRequest" status={entry.fromStatus} />
                <ArrowRight className="text-muted-foreground size-3.5" aria-label="to" />
              </>
            ) : null}
            {entry.toStatus && <StatusBadge domain="changeRequest" status={entry.toStatus} />}
            <span className="font-medium">{entry.actorName}</span>
            <span className="text-muted-foreground text-xs">
              <DateText value={entry.createdAt ?? null} kind="dateTime" />
            </span>
          </div>
          {entry.reason && <p className="text-muted-foreground mt-1 text-sm">“{entry.reason}”</p>}
        </li>
      ))}
    </ol>
  );
}
