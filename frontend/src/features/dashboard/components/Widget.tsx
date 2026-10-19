import type { UseQueryResult } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { ToneBadge } from '@/components/display/ToneBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { categoryApplied, categoryIgnored, type DashboardMeta, type WidgetResult } from '../types';

/**
 * Category chip driven by the widget's own response meta: the backend
 * lists `categoryId` under appliedFilters only when that endpoint's SQL
 * uses it. Nothing shows when no category is selected.
 */
export function CategoryChip({ meta }: { meta: DashboardMeta | undefined }) {
  if (categoryApplied(meta)) return <ToneBadge tone="info">Filtered by category</ToneBadge>;
  if (categoryIgnored(meta)) {
    return <span className="text-muted-foreground text-xs font-medium">All categories</span>;
  }
  return null;
}

/**
 * Card for one dashboard visual with its own loading, error and empty
 * states. Each widget owns its query, so if one endpoint fails only this
 * card shows the error (with requestId and Retry) and the rest of the
 * dashboard keeps rendering.
 */
export function Widget<T>({
  title,
  description,
  query,
  isEmpty,
  onReset,
  className,
  children,
}: {
  title: string;
  description?: string;
  query: UseQueryResult<WidgetResult<T>>;
  isEmpty: (data: T) => boolean;
  onReset: () => void;
  className?: string;
  children: (data: T, meta: DashboardMeta) => ReactNode;
}) {
  const result = query.data;

  let body: ReactNode;
  if (query.isPending) {
    body = <Skeleton className="h-64 w-full" aria-label={`Loading ${title}`} />;
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (isEmpty(result!.data)) {
    body = (
      <EmptyState
        icon={SearchX}
        message="No data for these filters."
        action={
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset filters
          </Button>
        }
      />
    );
  } else {
    body = children(result!.data, result!.meta);
  }

  return (
    <Card className={cn('min-w-0 gap-3 p-5', className)} aria-label={title} role="region">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
        <CategoryChip meta={result?.meta} />
      </div>
      {body}
    </Card>
  );
}
