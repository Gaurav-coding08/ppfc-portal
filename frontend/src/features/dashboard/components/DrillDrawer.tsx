import { useState } from 'react';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDate } from '@/lib/format';
import { DRILL_PAGE_SIZE, type DrillRequest } from '../drill';
import { useDrillQuery, type DrillResult } from '../hooks/useDrillQuery';
import { withoutCategory, type DashboardQuery } from '../types';
import { costDrillColumns, crDrillColumns, riskDrillColumns, taskDrillColumns } from './drillColumns';
import { FilterContext } from './FilterContext';

/**
 * Right-side drawer listing the records behind a KPI or chart element.
 * The header repeats the dashboard filter context and shows
 * "N records · <figure>": N is the drill endpoint's `meta.total`, the
 * figure is the number that was clicked — so a KPI can be reconciled with
 * its records by eye (and with SQL via docs/kpi-definitions.md).
 */
export function DrillDrawer({
  request,
  query,
  onClose,
}: {
  request: DrillRequest | null;
  query: DashboardQuery;
  onClose: () => void;
}) {
  return (
    <Sheet open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        {/* Keyed by the request so the page number starts at 1 for every new drill. */}
        {request && (
          <DrillBody key={JSON.stringify(request.params) + request.kind} request={request} query={query} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrillBody({ request, query }: { request: DrillRequest; query: DashboardQuery }) {
  const [page, setPage] = useState(1);
  // The drill uses the same filters as the widget it came from: if that
  // widget ignored the category filter, so does its drill.
  const filters = request.includeCategory ? query : withoutCategory(query);
  const drill = useDrillQuery(request, filters, page);
  const meta = drill.data?.meta;

  return (
    <>
      <SheetHeader className="gap-2 border-b pr-12">
        <SheetTitle>{request.title}</SheetTitle>
        <SheetDescription render={<div />}>
          <FilterContext query={query} categoryIgnored={!request.includeCategory} />
          {meta && <span className="mt-1 block text-xs">As of {formatDate(meta.asOf)}</span>}
        </SheetDescription>
        <p className="text-sm font-medium text-slate-900 tabular-nums" aria-live="polite">
          {meta ? `${meta.total} ${meta.total === 1 ? 'record' : 'records'}` : 'Loading records…'}
          {request.reconcile && (
            <>
              {' · '}
              <span className="text-muted-foreground font-normal">{request.reconcile.label}</span>{' '}
              {request.reconcile.value}
            </>
          )}
        </p>
      </SheetHeader>
      <div className="space-y-4 px-4 pb-6">
        {drill.isPending ? (
          <LoadingState rows={6} />
        ) : drill.isError ? (
          <ErrorState error={drill.error} onRetry={() => void drill.refetch()} />
        ) : drill.data.rows.length === 0 ? (
          <EmptyState message="No records for these filters." />
        ) : (
          <>
            <DrillTable result={drill.data} />
            <Pagination
              page={page}
              pageSize={DRILL_PAGE_SIZE}
              total={drill.data.meta.total}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}

function DrillTable({ result }: { result: DrillResult }) {
  switch (result.kind) {
    case 'costs':
      return (
        <DataTable
          columns={costDrillColumns}
          data={result.rows}
          enableColumnVisibility={false}
          getRowId={(r) => String(r.id)}
        />
      );
    case 'tasks':
      return (
        <DataTable
          columns={taskDrillColumns}
          data={result.rows}
          enableColumnVisibility={false}
          getRowId={(r) => String(r.id)}
        />
      );
    case 'risks':
      return (
        <DataTable
          columns={riskDrillColumns}
          data={result.rows}
          enableColumnVisibility={false}
          getRowId={(r) => String(r.id)}
        />
      );
    case 'change-requests':
      return (
        <DataTable
          columns={crDrillColumns}
          data={result.rows}
          enableColumnVisibility={false}
          getRowId={(r) => String(r.id)}
        />
      );
  }
}
