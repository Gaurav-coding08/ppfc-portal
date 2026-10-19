import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, isVersionConflict } from '@/api/errors';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { TextareaField } from '@/components/form/TextareaField';
import { VersionConflictDialog } from '@/components/form/VersionConflictDialog';
import { Button } from '@/components/ui/button';
import { newIdempotencyKey } from '@/lib/idempotency';
import { toastApiError } from '@/lib/notify';
import { useDecideCr, useInvalidateChangeRequests } from '../hooks/useCrMutations';
import { decisionSchema, type DecisionValues } from '../schemas';
import type { ChangeRequestDetail, CrDecision } from '../types';

const CONFIRM: Record<CrDecision, { title: string; label: string; consequence: string; done: string }> = {
  approve: {
    title: 'Approve this change request?',
    label: 'Approve',
    consequence:
      'The request becomes approved and can no longer be changed. Approval records the decision only — it does not change the project budget or costs.',
    done: 'Change request approved',
  },
  reject: {
    title: 'Reject this change request?',
    label: 'Reject',
    consequence: 'The request becomes rejected and can no longer be changed or resubmitted.',
    done: 'Change request rejected',
  },
  return: {
    title: 'Return this change request?',
    label: 'Return',
    consequence: 'The request goes back to the requester, who can edit and resubmit it.',
    done: 'Change request returned to the requester',
  },
};

// Approve / Reject / Return for a submitted CR.
//
// `eligibility` comes from can.ts (UI hint only): 'eligible' shows a live
// panel; 'own' shows it disabled because the backend refuses
// self-approval. Either way the backend has the final word, and every
// error it returns is handled below.
//
// Double-submit protection, in three layers:
// 1. One Idempotency-Key per panel, created when it mounts and reused for
//    every retry — the backend replays the first response for a repeat.
//    It is only replaced after a successful decision (a CR that is
//    returned and resubmitted needs a fresh key for its next decision,
//    or the backend would replay the old one).
// 2. `inFlight` ref: a second click that lands before React re-renders
//    with `isPending` is dropped without sending anything.
// 3. Buttons disable while the request is pending.
export function DecisionPanel({
  cr,
  eligibility,
}: {
  cr: ChangeRequestDetail;
  eligibility: 'eligible' | 'own';
}) {
  const decide = useDecideCr(cr.id!);
  const invalidate = useInvalidateChangeRequests();
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [pendingDecision, setPendingDecision] = useState<CrDecision | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const inFlight = useRef(false);
  const disabled = eligibility === 'own';

  const form = useForm<DecisionValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { reason: '' },
  });

  // Validate the reason first, then ask for confirmation.
  const choose = (decision: CrDecision) => form.handleSubmit(() => setPendingDecision(decision))();

  async function confirm() {
    if (!pendingDecision || inFlight.current) return;
    inFlight.current = true;
    try {
      await decide.mutateAsync({
        body: {
          decision: pendingDecision,
          reason: form.getValues('reason').trim(),
          version: cr.version ?? 1,
        },
        idempotencyKey,
      });
      toast.success(CONFIRM[pendingDecision].done);
      setIdempotencyKey(newIdempotencyKey());
      form.reset();
    } catch (err) {
      if (isVersionConflict(err)) {
        // Someone else changed the CR first. Never retry with a fresh version.
        setConflictOpen(true);
      } else if (err instanceof ApiError && err.code === 'INVALID_TRANSITION') {
        // Usually another reviewer decided first: say so and reload the CR
        // so the page shows its real state.
        toastApiError(err);
        void invalidate();
      } else {
        // 403 (not a reviewer on this project), 422 SELF_APPROVAL_FORBIDDEN, …
        toastApiError(err);
      }
    } finally {
      inFlight.current = false;
      setPendingDecision(null);
    }
  }

  const { errors } = form.formState;
  const busy = decide.isPending;

  return (
    <section aria-labelledby="decision-heading" className="bg-card space-y-4 rounded-xl border p-5 shadow-sm">
      <div>
        <h2 id="decision-heading" className="text-base font-semibold">
          Decision
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {disabled
            ? "You can't decide your own request. Another project manager or an admin must review it."
            : 'Every decision needs a reason. It is shown to the requester and kept in the history.'}
        </p>
      </div>

      <TextareaField
        label="Reason"
        required
        rows={3}
        disabled={disabled || busy}
        {...form.register('reason')}
        error={errors.reason?.message}
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => choose('approve')} disabled={disabled || busy}>
          Approve
        </Button>
        <Button variant="outline" onClick={() => choose('return')} disabled={disabled || busy}>
          Return
        </Button>
        <Button variant="destructive" onClick={() => choose('reject')} disabled={disabled || busy}>
          Reject
        </Button>
      </div>

      <ConfirmDialog
        open={pendingDecision !== null}
        onOpenChange={(open) => !open && !busy && setPendingDecision(null)}
        title={pendingDecision ? CONFIRM[pendingDecision].title : ''}
        description={pendingDecision ? CONFIRM[pendingDecision].consequence : ''}
        confirmLabel={pendingDecision ? CONFIRM[pendingDecision].label : 'Confirm'}
        destructive={pendingDecision === 'reject'}
        pending={busy}
        onConfirm={confirm}
      />
      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </section>
  );
}
