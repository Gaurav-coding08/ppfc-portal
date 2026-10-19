import { Plus, Receipt } from 'lucide-react';
import { forwardRef, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/errors';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { Pagination } from '@/components/data/Pagination';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { ReasonConfirmDialog } from '@/components/form/ReasonConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { newIdempotencyKey } from '@/lib/idempotency';
import { toastApiError } from '@/lib/notify';
import {
  useDeleteCost,
  useInvalidateFinance,
  usePostCost,
  useReverseCost,
} from '../hooks/useFinanceMutations';
import { COST_PAGE_SIZE, useProjectCosts } from '../hooks/useFinanceQueries';
import type { Cost, CostListFilters } from '../types';
import { CostFilters } from './CostFilters';
import { CostFormSheet } from './CostFormSheet';
import { costColumns, costRowClassName } from './costColumns';

// A post being confirmed, with the Idempotency-Key created when the
// confirmation opened (reused for any retry from that dialog).
interface PendingPost {
  cost: Cost;
  key: string;
}

// The project's cost transactions. Filters, sort and page live in the URL
// (owned by FinanceTab so the Actual spend card can set them). Managers
// get Add / Edit / Delete / Post / Reverse; everyone else sees the table
// only — the backend re-checks every write and its 403 becomes a toast.
export const CostsSection = forwardRef<
  HTMLElement,
  {
    projectId: number;
    canManage: boolean;
    asOf: string | undefined;
    filters: CostListFilters;
    setFilters: (patch: Partial<CostListFilters>) => void;
  }
>(function CostsSection({ projectId, canManage, asOf, filters, setFilters }, ref) {
  const list = useProjectCosts(projectId, filters);
  const postCost = usePostCost();
  const reverseCost = useReverseCost();
  const deleteCost = useDeleteCost();
  const invalidate = useInvalidateFinance();

  // `editing === 'new'` opens an empty draft form.
  const [editing, setEditing] = useState<Cost | 'new' | null>(null);
  const [toPost, setToPost] = useState<PendingPost | null>(null);
  const [toReverse, setToReverse] = useState<Cost | null>(null);
  const [toDelete, setToDelete] = useState<Cost | null>(null);
  // Drops a second click that lands before React re-renders with
  // `isPending` (the button is also disabled while pending).
  const inFlight = useRef(false);

  const columns = useMemo(
    () =>
      costColumns(
        canManage
          ? {
              onEdit: setEditing,
              onDelete: setToDelete,
              onPost: (cost) => setToPost({ cost, key: newIdempotencyKey() }),
              onReverse: setToReverse,
            }
          : undefined,
      ),
    [canManage],
  );

  // A state change made elsewhere (someone else posted or reversed it
  // first) comes back as INVALID_TRANSITION: say so and reload the table.
  function handleWriteError(err: unknown, close: () => void) {
    toastApiError(err);
    if (err instanceof ApiError && (err.code === 'INVALID_TRANSITION' || err.code === 'VERSION_CONFLICT')) {
      close();
      void invalidate();
    }
  }

  async function confirmPost() {
    if (!toPost || inFlight.current) return;
    inFlight.current = true;
    try {
      await postCost.mutateAsync({ id: toPost.cost.id!, idempotencyKey: toPost.key });
      toast.success('Cost posted');
      setToPost(null);
    } catch (err) {
      handleWriteError(err, () => setToPost(null));
    } finally {
      inFlight.current = false;
    }
  }

  async function confirmReverse(reason: string) {
    if (!toReverse || inFlight.current) return;
    inFlight.current = true;
    try {
      await reverseCost.mutateAsync({ id: toReverse.id!, reason });
      toast.success('Reversal entry posted');
      setToReverse(null);
    } catch (err) {
      handleWriteError(err, () => setToReverse(null));
    } finally {
      inFlight.current = false;
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await deleteCost.mutateAsync(toDelete.id!);
      toast.success('Draft cost deleted');
      setToDelete(null);
    } catch (err) {
      handleWriteError(err, () => setToDelete(null));
    }
  }

  const hasFilters = !!(filters.status || filters.categoryId || filters.from || filters.to);
  // The drill-down from the Actual spend card: posted rows dated on or
  // before the as-of date are exactly the rows actual spend sums.
  const isDrillDown =
    !!asOf && filters.status === 'posted' && filters.to === asOf && !filters.from && !filters.categoryId;

  const addButton = canManage ? (
    <Button onClick={() => setEditing('new')}>
      <Plus className="size-4" />
      Add cost
    </Button>
  ) : undefined;

  return (
    <section ref={ref} aria-labelledby="costs-heading" className="scroll-mt-6">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="costs-heading" className="text-base font-semibold">
              Costs
            </h2>
            <p className="text-muted-foreground text-sm">
              Posted costs can't be edited or deleted; corrections are made by reversal.
            </p>
          </div>
          {addButton}
        </div>

        <CostFilters filters={filters} setFilters={setFilters} />

        {isDrillDown && (
          <p
            role="status"
            className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 ring-1 ring-indigo-200"
          >
            Showing the posted transactions that make up actual spend as of {formatDate(asOf!)}. Reversals
            appear as negative amounts.
          </p>
        )}

        {list.isPending ? (
          <LoadingState rows={5} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.total === 0 ? (
          <EmptyState
            icon={Receipt}
            message={hasFilters ? 'No costs match these filters.' : 'No costs recorded yet.'}
            action={hasFilters ? undefined : addButton}
          />
        ) : (
          <div className="space-y-3">
            <DataTable
              columns={columns}
              data={list.data.rows}
              getRowId={(row) => String(row.id)}
              getRowClassName={costRowClassName}
              sort={filters.sort}
              order={filters.order as 'asc' | 'desc'}
              onSortChange={(sort, order) => setFilters({ sort, order, page: '1' })}
            />
            <Pagination
              page={Number(filters.page) || 1}
              pageSize={COST_PAGE_SIZE}
              total={list.data.total}
              onPageChange={(page) => setFilters({ page: String(page) })}
            />
          </div>
        )}
      </Card>

      {canManage && (
        <>
          <CostFormSheet
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            projectId={projectId}
            cost={editing === 'new' || editing === null ? undefined : editing}
          />
          <ConfirmDialog
            open={toPost !== null}
            onOpenChange={(open) => !open && !postCost.isPending && setToPost(null)}
            title="Post this cost?"
            description="Posted costs can't be edited or deleted; corrections are made by reversal. Once posted, the amount counts toward actual spend."
            confirmLabel="Post cost"
            pending={postCost.isPending}
            onConfirm={confirmPost}
          />
          <ReasonConfirmDialog
            open={toReverse !== null}
            onOpenChange={(open) => !open && setToReverse(null)}
            title="Reverse this cost?"
            description="A posted reversal entry for the same amount is added and actual spend goes down by that amount. The original cost stays on record and can't be reversed again."
            confirmLabel="Reverse cost"
            destructive
            pending={reverseCost.isPending}
            onConfirm={confirmReverse}
          />
          <ConfirmDialog
            open={toDelete !== null}
            onOpenChange={(open) => !open && setToDelete(null)}
            title="Delete this draft?"
            description={`"${toDelete?.description ?? ''}" will be removed. Drafts never counted toward actual spend.`}
            confirmLabel="Delete draft"
            destructive
            pending={deleteCost.isPending}
            onConfirm={confirmDelete}
          />
        </>
      )}
    </section>
  );
});
