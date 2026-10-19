import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { FilterBar } from '@/components/data/FilterBar';
import { FilterSelect } from '@/components/data/FilterSelect';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { DateText } from '@/components/display/DateText';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toastApiError } from '@/lib/notify';
import { AUTOMATION_PAGE_SIZE, useOutboxEvents, useRetryOutboxEvent } from '../hooks/useAutomation';
import { OUTBOX_STATUS_OPTIONS, type AutomationListFilters, type OutboxEvent } from '../types';

// Outbox events queued by the producer (TASK_OVERDUE) and by CR approvals
// (CR_APPROVED). A failed event has used up its delivery attempts; Retry
// resets it to pending for the next dispatcher pass.
export function OutboxTable({
  filters,
  setFilters,
}: {
  filters: AutomationListFilters;
  setFilters: (patch: Partial<AutomationListFilters>) => void;
}) {
  const events = useOutboxEvents(filters);
  const retry = useRetryOutboxEvent();
  const [target, setTarget] = useState<OutboxEvent | null>(null);

  async function confirmRetry() {
    if (!target) return;
    try {
      await retry.mutateAsync(target.id!);
      toast.success(`Event #${target.id} queued for delivery again`);
    } catch (err) {
      // 422 INVALID_TRANSITION if it is no longer failed (e.g. retried in
      // another tab); the invalidation below shows its real status.
      toastApiError(err);
    } finally {
      setTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <FilterSelect
          label="Outbox status"
          allLabel="All statuses"
          value={filters.status}
          onChange={(status) => setFilters({ status, page: '1' })}
          options={OUTBOX_STATUS_OPTIONS}
        />
      </FilterBar>

      {events.isPending ? (
        <LoadingState rows={6} />
      ) : events.isError ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : events.data.total === 0 ? (
        <EmptyState icon={Inbox} message="No outbox events match this filter." />
      ) : (
        <div className="space-y-3">
          <Card className="p-0">
            <div className="overflow-x-auto">
              <Table aria-label="Outbox events">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Event</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead>Last error</TableHead>
                    <TableHead>Next attempt</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.data.rows.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="pl-5 font-mono text-xs">
                        #{event.id} {event.eventType}
                      </TableCell>
                      <TableCell>
                        {(event.entityType ?? '').replaceAll('_', ' ')} #{event.entityId}
                      </TableCell>
                      <TableCell>
                        <StatusBadge domain="outbox" status={event.status ?? ''} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{event.attempts}</TableCell>
                      <TableCell className="max-w-56 truncate text-rose-700" title={event.lastError ?? ''}>
                        {event.lastError ?? ''}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {/* Only meaningful while the event is still waiting. */}
                        {event.status === 'pending' ? (
                          <DateText value={event.nextAttemptAt ?? null} kind="dateTime" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <DateText value={event.createdAt ?? null} kind="dateTime" />
                      </TableCell>
                      <TableCell className="text-right">
                        {event.status === 'failed' && (
                          <Button variant="outline" size="sm" onClick={() => setTarget(event)}>
                            Retry
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
          <Pagination
            page={Number(filters.page) || 1}
            pageSize={AUTOMATION_PAGE_SIZE}
            total={events.data.total}
            onPageChange={(page) => setFilters({ page: String(page) })}
          />
        </div>
      )}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Retry event #${target?.id ?? ''}?`}
        description="Its attempt count resets to 0 and it goes back to pending. The next dispatcher pass (scheduled, or Run now) tries to deliver it again."
        confirmLabel="Retry"
        pending={retry.isPending}
        onConfirm={confirmRetry}
      />
    </div>
  );
}
