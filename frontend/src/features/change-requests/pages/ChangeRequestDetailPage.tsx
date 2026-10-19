import { ArrowLeft, Info, SearchX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isNotFound } from '@/api/errors';
import { canDecideChangeRequest } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { LoadingState } from '@/components/data/LoadingState';
import { DateText } from '@/components/display/DateText';
import { StatusBadge } from '@/components/display/StatusBadge';
import { Button } from '@/components/ui/button';
import { useProjectLabel } from '@/features/projects/hooks/useReferenceData';
import { CrHistoryTimeline } from '../components/CrHistoryTimeline';
import { DecisionPanel } from '../components/DecisionPanel';
import { ResubmitSheet } from '../components/ResubmitSheet';
import { useChangeRequest } from '../hooks/useCrQueries';

// One change request: its fields, the full status history, and whichever
// action the viewer may take in its current state:
// - submitted → Decision panel for reviewers (disabled for the requester)
// - returned  → "Edit and resubmit" for the requester
// - approved / rejected → no actions (terminal)
export function ChangeRequestDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { user, memberships } = useAuth();
  const detail = useChangeRequest(id);
  const projectLabel = useProjectLabel();
  const [resubmitOpen, setResubmitOpen] = useState(false);

  if (!Number.isInteger(id) || id <= 0) return <CrNotFound />;
  if (detail.isPending) return <LoadingState rows={6} />;
  if (detail.isError) {
    // 404 covers both "missing" and "outside your projects" (don't leak existence).
    if (isNotFound(detail.error)) return <CrNotFound />;
    return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  }

  const cr = detail.data;
  // UI hints only — the decision and resubmit endpoints re-check everything.
  const eligibility = canDecideChangeRequest(user, memberships, {
    projectId: cr.projectId!,
    requestedBy: cr.requestedBy!,
  });
  // Only a submitted CR can be decided; approved/rejected are terminal and
  // a returned one waits for the requester to resubmit.
  const showDecision = cr.status === 'submitted' && eligibility !== 'none';
  const canResubmit = cr.status === 'returned' && cr.requestedBy === user?.id;

  return (
    <div className="space-y-6">
      <BackLink />

      <section className="bg-card space-y-4 rounded-xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm font-medium">{cr.code}</span>
              {cr.status && <StatusBadge domain="changeRequest" status={cr.status} />}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{cr.title}</h1>
            <Link
              to={`/projects/${cr.projectId}?tab=change-requests`}
              className="text-primary text-sm hover:underline"
            >
              {projectLabel(cr.projectId!)}
            </Link>
          </div>
          {canResubmit && <Button onClick={() => setResubmitOpen(true)}>Edit and resubmit</Button>}
        </div>

        {cr.status === 'approved' && (
          <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 ring-1 ring-sky-200">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Approval does not change budget or costs. Any budget change needs its own budget revision.
          </p>
        )}

        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Requested by">{cr.requesterName}</Fact>
          <Fact label="Submitted">
            <DateText value={cr.submittedAt ?? null} kind="dateTime" />
          </Fact>
          <Fact label="Decided by">{cr.deciderName ?? <span className="text-muted-foreground">—</span>}</Fact>
          <Fact label="Decided">
            <DateText value={cr.decidedAt ?? null} kind="dateTime" />
          </Fact>
        </dl>
        <dl className="space-y-4">
          {cr.decisionReason && <Fact label="Decision reason">{cr.decisionReason}</Fact>}
          <Fact label="Description">
            {cr.description ?? <span className="text-muted-foreground">None</span>}
          </Fact>
          <Fact label="Impact summary">
            {cr.impactSummary ?? <span className="text-muted-foreground">None</span>}
          </Fact>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section
          aria-labelledby="history-heading"
          className="bg-card space-y-4 rounded-xl border p-5 shadow-sm"
        >
          <h2 id="history-heading" className="text-base font-semibold">
            History
          </h2>
          <CrHistoryTimeline history={cr.history ?? []} />
        </section>

        {/* `key` remounts the panel per CR version, so its reason field and
            Idempotency-Key never carry over to a new round of review. */}
        {showDecision && (
          <div>
            <DecisionPanel key={cr.version} cr={cr} eligibility={eligibility as 'eligible' | 'own'} />
          </div>
        )}
      </div>

      {canResubmit && <ResubmitSheet open={resubmitOpen} onOpenChange={setResubmitOpen} cr={cr} />}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-sm whitespace-pre-line">{children}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2"
      nativeButton={false}
      render={<Link to="/change-requests" />}
    >
      <ArrowLeft className="size-4" />
      Change requests
    </Button>
  );
}

function CrNotFound() {
  return (
    <div className="space-y-6">
      <BackLink />
      <EmptyState icon={SearchX} message="Change request not found or you don't have access." />
    </div>
  );
}
