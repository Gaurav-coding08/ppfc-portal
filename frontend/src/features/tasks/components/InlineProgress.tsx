import { useState } from 'react';
import { toast } from 'sonner';
import { isVersionConflict } from '@/api/errors';
import { SubmitButton } from '@/components/form/SubmitButton';
import { VersionConflictDialog } from '@/components/form/VersionConflictDialog';
import { toastApiError } from '@/lib/notify';
import { forbiddenFieldsMessage } from '../forbiddenFields';
import { useUpdateTask } from '../hooks/useTaskMutations';
import type { TaskRow } from '../types';
import { ProgressInput } from './ProgressInput';

// Progress editor inside a My tasks row. The draft value is local until
// Save; after the PATCH the task lists and project queries are
// invalidated (useUpdateTask), and the row re-renders from the refetched
// API data — the new number is never written into the cache by hand.
//
// `key={task.version}` on the caller resets the draft whenever a fresh
// version of the task arrives.
export function InlineProgress({ task }: { task: TaskRow }) {
  const saved = task.progress ?? 0;
  const [draft, setDraft] = useState(saved);
  const [conflictOpen, setConflictOpen] = useState(false);
  const update = useUpdateTask();
  const valid = Number.isInteger(draft) && draft >= 0 && draft <= 100;
  const changed = draft !== saved;

  async function save() {
    try {
      await update.mutateAsync({ id: task.id!, body: { progress: draft, version: task.version ?? 1 } });
      toast.success('Progress saved');
    } catch (err) {
      if (isVersionConflict(err)) {
        setConflictOpen(true);
        return;
      }
      const forbidden = forbiddenFieldsMessage(err);
      if (forbidden) toast.error(forbidden);
      else toastApiError(err);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <ProgressInput
        id={`progress-${task.id}`}
        label={`Progress for ${task.title}`}
        value={draft}
        onChange={setDraft}
        invalid={!valid}
        disabled={update.isPending}
        className="w-64"
      />
      {changed && (
        <SubmitButton type="button" size="sm" pending={update.isPending} disabled={!valid} onClick={save}>
          Save
        </SubmitButton>
      )}
      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </div>
  );
}
