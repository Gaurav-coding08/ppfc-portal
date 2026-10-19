import { Plus, Wallet } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/errors';
import { canDecideBudgetRevision } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { DateText } from '@/components/display/DateText';
import { Money } from '@/components/display/Money';
import { StatusBadge } from '@/components/display/StatusBadge';
import { ReasonConfirmDialog } from '@/components/form/ReasonConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { newIdempotencyKey } from '@/lib/idempotency';
import { toastApiError } from '@/lib/notify';
import { useDecideRevision, useInvalidateFinance } from '../hooks/useFinanceMutations';
import { useBudget } from '../hooks/useFinanceQueries';
import type { BudgetRevision } from '../types';
import { RevisionFormSheet } from './RevisionFormSheet';

type Decision = 'approve' | 'reject';

// The decision being confirmed, with the Idempotency-Key created when its
// dialog opened. The key is reused for every retry from that dialog and
// discarded when it closes, so a double click or a retried request can
// never decide twice.
interface PendingDecision {
  revision: BudgetRevision;
  decision: Decision;
  key: string;
}

const CONSEQUENCE: Record<Decision, string> = {
  approve:
    'The revision becomes approved and is added to the current approved budget. This cannot be undone.',
  reject: 'The revision becomes rejected. It stays listed but never affects the budget.',
};

export function BudgetSection({ projectId, canManage }: { projectId: number; canManage: boolean }) {
  const { user } = useAuth();
  const budget = useBudget(projectId);
  const decide = useDecideRevision();
  const invalidate = useInvalidateFinance();
  const [requestOpen, setRequestOpen] = useState(false);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const inFlight = useRef(false);

  async function confirm(reason: string) {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    try {
      await decide.mutateAsync({
        id: pending.revision.id!,
        decision: pending.decision,
        reason,
        idempotencyKey: pending.key,
      });
      toast.success(pending.decision === 'approve' ? 'Budget revision approved' : 'Budget revision rejected');
      setPending(null);
    } catch (err) {
      toastApiError(err);
      // Someone else decided first (or it's no longer pending): close and
      // reload so the table shows the real state.
      if (err instanceof ApiError && err.code === 'INVALID_TRANSITION') {
        setPending(null);
        void invalidate();
      }
    } finally {
      inFlight.current = false;
    }
  }

  const requestButton = canManage ? (
    <Button variant="outline" size="sm" onClick={() => setRequestOpen(true)}>
      <Plus className="size-4" />
      Request revision
    </Button>
  ) : undefined;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Budget</h2>
          <p className="text-muted-foreground text-sm">
            Only approved revisions count toward the current approved budget.
          </p>
        </div>
        {requestButton}
      </div>

      {budget.isPending ? (
        <LoadingState rows={3} />
      ) : budget.isError ? (
        <ErrorState error={budget.error} onRetry={() => budget.refetch()} />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <Figure label="Initial approved budget" amount={budget.data.initialAmount} />
            <Figure label="Approved revisions" amount={budget.data.approvedRevisionsTotal} />
            <Figure label="Current approved budget" amount={budget.data.currentBudget} />
          </dl>

          {(budget.data.revisions ?? []).length === 0 ? (
            <EmptyState icon={Wallet} message="No budget revisions requested yet." action={requestButton} />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table aria-label="Budget revisions">
                <TableHeader>
                  <TableRow>
                    <TableHead>Effective</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Rationale</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead>Decided by</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budget.data.revisions!.map((rev) => (
                    <RevisionRow
                      key={rev.id}
                      revision={rev}
                      eligibility={canDecideBudgetRevision(user, rev)}
                      onDecide={(decision) =>
                        setPending({ revision: rev, decision, key: newIdempotencyKey() })
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {canManage && (
        <RevisionFormSheet open={requestOpen} onOpenChange={setRequestOpen} projectId={projectId} />
      )}
      <ReasonConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.decision === 'approve' ? 'Approve this budget revision?' : 'Reject this budget revision?'
        }
        description={pending ? CONSEQUENCE[pending.decision] : ''}
        confirmLabel={pending?.decision === 'approve' ? 'Approve revision' : 'Reject revision'}
        destructive={pending?.decision === 'reject'}
        pending={decide.isPending}
        onConfirm={confirm}
      />
    </Card>
  );
}

function Figure({ label, amount }: { label: string; amount: number | undefined }) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="font-semibold">
        <Money amount={amount ?? null} />
      </dd>
    </div>
  );
}

function RevisionRow({
  revision,
  eligibility,
  onDecide,
}: {
  revision: BudgetRevision;
  eligibility: 'eligible' | 'own' | 'none';
  onDecide: (decision: Decision) => void;
}) {
  const counted = revision.status === 'approved';
  return (
    <TableRow className={counted ? undefined : 'text-muted-foreground'}>
      <TableCell className="whitespace-nowrap">
        <DateText value={revision.effectiveDate ?? null} />
      </TableCell>
      <TableCell className="text-right">
        <Money amount={revision.amount ?? null} />
      </TableCell>
      <TableCell>
        <span className="line-clamp-2 max-w-xs" title={revision.rationale}>
          {revision.rationale}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <StatusBadge domain="revision" status={revision.status!} />
          {!counted && <span className="text-xs">Not included in approved budget</span>}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">{revision.requestedByName}</TableCell>
      <TableCell>
        {revision.decidedByName ? (
          <div className="text-sm">
            <p className="whitespace-nowrap">{revision.decidedByName}</p>
            {revision.decisionReason && (
              <p className="text-muted-foreground line-clamp-1 text-xs" title={revision.decisionReason}>
                “{revision.decisionReason}”
              </p>
            )}
          </div>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>
        {revision.status === 'pending' && eligibility !== 'none' && (
          <div className="flex justify-end gap-1">
            {/* An admin's own request: shown but disabled (backend refuses self-approval). */}
            <Button
              size="sm"
              disabled={eligibility === 'own'}
              title={eligibility === 'own' ? "You can't decide your own request" : undefined}
              onClick={() => onDecide('approve')}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={eligibility === 'own'}
              title={eligibility === 'own' ? "You can't decide your own request" : undefined}
              onClick={() => onDecide('reject')}
            >
              Reject
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
