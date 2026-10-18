// Resolves the final (status, progress, completedAt) for a task from its
// current state plus a partial patch, applying CLAUDE.md's task rules:
//   - status: 'done' (explicit) always normalises progress to 100 — chosen
//     over rejecting a mismatched progress value, since a caller marking a
//     task done rarely bothers to also set progress=100 by hand.
//   - progress reaching 100 without an explicit status in the patch infers
//     status: 'done'.
//   - a task that is currently 'done' whose progress is explicitly dropped
//     below 100 (status untouched) implicitly leaves done -> 'in_progress'.
//   - completed_at is set to now() only on the transition INTO done, kept
//     unchanged while staying done, and cleared otherwise ("moving out of
//     done clears completed_at").
// Used by both task creation (current = defaults) and PATCH.
export interface StatusProgressInput {
  status: string;
  progress: number;
}

export interface StatusProgressResult {
  status: string;
  progress: number;
  completedAt: Date | string | null;
}

export function resolveStatusProgress(
  current: StatusProgressInput & { completedAt: Date | string | null },
  patch: { status?: string; progress?: number },
): StatusProgressResult {
  let status = patch.status ?? current.status;
  let progress = patch.progress ?? current.progress;

  if (patch.status === 'done') {
    progress = 100;
  } else if (patch.status === undefined && progress === 100 && current.status !== 'done') {
    status = 'done';
  } else if (patch.status === undefined && current.status === 'done' && progress < 100) {
    status = 'in_progress';
  }

  let completedAt: Date | string | null;
  if (status === 'done') {
    completedAt = current.status === 'done' ? current.completedAt : new Date();
  } else {
    completedAt = null;
  }

  return { status, progress, completedAt };
}
