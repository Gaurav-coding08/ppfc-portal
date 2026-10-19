import { Bot } from 'lucide-react';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { DateText } from '@/components/display/DateText';
import { StatusBadge } from '@/components/display/StatusBadge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AUTOMATION_PAGE_SIZE, useAutomationRuns } from '../hooks/useAutomation';
import { formatDuration, JOB_LABELS, TRIGGER_LABELS, type AutomationListFilters } from '../types';

// The persistent log of every automation pass (automation_runs), newest
// first — scheduled worker ticks and manual runs alike.
export function RunsTable({
  filters,
  onPageChange,
}: {
  filters: AutomationListFilters;
  onPageChange: (page: number) => void;
}) {
  const runs = useAutomationRuns(filters);

  if (runs.isPending) return <LoadingState rows={6} />;
  if (runs.isError) return <ErrorState error={runs.error} onRetry={() => runs.refetch()} />;
  if (runs.data.total === 0) return <EmptyState icon={Bot} message="No automation runs yet." />;

  return (
    <div className="space-y-3">
      <Card className="p-0">
        <div className="overflow-x-auto">
          <Table aria-label="Automation runs">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Job</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Found</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.data.rows.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="pl-5 font-medium">
                    {JOB_LABELS[run.jobName ?? ''] ?? run.jobName}
                  </TableCell>
                  <TableCell>{TRIGGER_LABELS[run.trigger ?? ''] ?? run.trigger}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <DateText value={run.startedAt ?? null} kind="dateTime" />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDuration(run.startedAt, run.finishedAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge domain="automationRun" status={run.status ?? ''} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{run.itemsFound ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{run.itemsCreated ?? '—'}</TableCell>
                  <TableCell className="max-w-64 truncate text-rose-700" title={run.error ?? ''}>
                    {run.error ?? ''}
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
        total={runs.data.total}
        onPageChange={onPageChange}
      />
    </div>
  );
}
