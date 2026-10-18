// Pure state machine for change request status transitions.
// Every legal (from, action) → to mapping is here; anything not listed is
// an illegal transition. Unit-tested in tests/unit/workflow.test.ts.

export type CrStatus = 'submitted' | 'approved' | 'rejected' | 'returned';
export type CrAction = 'submit' | 'approve' | 'reject' | 'return' | 'resubmit';

const TRANSITIONS: Record<string, CrStatus | undefined> = {
  'submitted:approve': 'approved',
  'submitted:reject': 'rejected',
  'submitted:return': 'returned',
  'returned:resubmit': 'submitted',
};

// Returns the next status, or null if the transition is illegal.
export function nextStatus(current: CrStatus, action: CrAction): CrStatus | null {
  return TRANSITIONS[`${current}:${action}`] ?? null;
}
