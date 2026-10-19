import { History } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { DateText } from '@/components/display/DateText';
import { PROJECT_PAGE_SIZE, useProjectActivity } from '../hooks/useProjectQueries';
import { describeAction } from '../activity';

// Page is local state rather than a URL param: it's a secondary feed inside
// a tab, not a shareable list view.
export function ActivityTab({ projectId }: { projectId: number }) {
  const [page, setPage] = useState(1);
  const activity = useProjectActivity(projectId, page);

  if (activity.isPending) return <LoadingState rows={6} />;
  if (activity.isError) return <ErrorState error={activity.error} onRetry={() => activity.refetch()} />;
  if (activity.data.total === 0) return <EmptyState icon={History} message="No activity recorded yet." />;

  return (
    <div className="space-y-3">
      <ol className="divide-y rounded-xl border">
        {activity.data.rows.map((event) => (
          <li
            key={event.id}
            className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
          >
            <p>
              <span className="font-medium">{event.actorName ?? 'System'}</span>{' '}
              <span className="text-muted-foreground">{describeAction(event)}</span>{' '}
              <span className="text-muted-foreground tabular-nums">#{event.entityId}</span>
            </p>
            <span className="text-muted-foreground text-xs">
              <DateText value={event.createdAt ?? null} kind="dateTime" />
            </span>
          </li>
        ))}
      </ol>
      <Pagination
        page={page}
        pageSize={PROJECT_PAGE_SIZE}
        total={activity.data.total}
        onPageChange={setPage}
      />
    </div>
  );
}
