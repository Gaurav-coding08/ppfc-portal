import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import * as queryKeys from '@/api/queryKeys';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

/**
 * "Last updated hh:mm:ss · Refresh". The time is the server's
 * `meta.generatedAt` of the KPI response, i.e. when the numbers on screen
 * were computed. Refresh invalidates every dashboard query, so all widgets
 * recompute from the database — the same path a mutation elsewhere takes.
 */
export function LastUpdated({ generatedAt }: { generatedAt: string | undefined }) {
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: queryKeys.dashboard.all }) > 0;

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <span aria-live="polite">
        {generatedAt ? `Last updated ${formatDateTime(generatedAt, 'HH:mm:ss')}` : 'Loading…'}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={fetching}
        onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all })}
      >
        <RefreshCw className={cn('size-4', fetching && 'animate-spin')} />
        Refresh
      </Button>
    </div>
  );
}
