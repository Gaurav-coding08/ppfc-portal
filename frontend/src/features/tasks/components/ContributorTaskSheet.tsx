import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { isVersionConflict } from '@/api/errors';
import { DateText } from '@/components/display/DateText';
import { PriorityBadge } from '@/components/display/PriorityBadge';
import { Field } from '@/components/form/Field';
import { SelectField } from '@/components/form/SelectField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { VersionConflictDialog } from '@/components/form/VersionConflictDialog';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { applyServerErrors } from '@/lib/applyServerErrors';
import { forbiddenFieldsMessage } from '../forbiddenFields';
import { useUpdateTask } from '../hooks/useTaskMutations';
import { CONTRIBUTOR_TASK_FIELDS, contributorTaskSchema, type ContributorTaskValues } from '../schemas';
import { TASK_STATUS_OPTIONS, type TaskRow } from '../types';
import { ProgressInput } from './ProgressInput';
import { TaskDueBadges } from './TaskDueBadges';

// The reduced form for a contributor updating their own assigned task.
// CLAUDE.md: a contributor may change only `progress` and `status`, so
// those are the only inputs rendered (and the only keys ever sent). The
// rest of the task is shown read-only for context. If the backend still
// refuses (403 with `details.fields`), the message names the fields.
export function ContributorTaskSheet({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRow | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {open && task && <ContributorTaskForm task={task} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function ContributorTaskForm({ task, onDone }: { task: TaskRow; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const update = useUpdateTask();

  const form = useForm<ContributorTaskValues>({
    resolver: zodResolver(contributorTaskSchema),
    defaultValues: { status: task.status ?? 'todo', progress: task.progress ?? 0 },
  });
  const { errors, dirtyFields } = form.formState;

  async function onSubmit(values: ContributorTaskValues) {
    setFormError(null);
    // Only changed fields are sent, so the backend's "progress 100 → done"
    // inference still applies when the status wasn't touched.
    const body = {
      ...(dirtyFields.status ? { status: values.status } : {}),
      ...(dirtyFields.progress ? { progress: values.progress } : {}),
    };
    if (Object.keys(body).length === 0) {
      onDone();
      return;
    }
    try {
      await update.mutateAsync({ id: task.id!, body: { ...body, version: task.version ?? 1 } });
      toast.success('Progress saved');
      onDone();
    } catch (err) {
      if (isVersionConflict(err)) {
        setConflictOpen(true);
        return;
      }
      setFormError(
        forbiddenFieldsMessage(err) ?? applyServerErrors(err, form.setError, CONTRIBUTOR_TASK_FIELDS),
      );
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Update my task</SheetTitle>
        <SheetDescription>You can update the progress and status of tasks assigned to you.</SheetDescription>
      </SheetHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        <div className="space-y-2 rounded-lg border bg-slate-50 p-3 text-sm">
          <p className="font-medium">{task.title}</p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-2">
            <span>
              Due <DateText value={task.dueDate ?? null} />
            </span>
            <TaskDueBadges task={task} />
            {task.priority && <PriorityBadge priority={task.priority} />}
          </div>
        </div>

        <Controller
          control={form.control}
          name="status"
          render={({ field }) => (
            <SelectField
              label="Status"
              name="status"
              required
              value={field.value}
              onChange={field.onChange}
              options={TASK_STATUS_OPTIONS}
              error={errors.status?.message}
            />
          )}
        />
        <Controller
          control={form.control}
          name="progress"
          render={({ field }) => (
            <Field
              label="Progress"
              htmlFor="progress"
              required
              error={errors.progress?.message}
              description="Reaching 100 % marks the task done."
            >
              <ProgressInput
                id="progress"
                label="Progress"
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.progress}
              />
            </Field>
          )}
        />

        {formError && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200"
          >
            {formError}
          </p>
        )}

        <SheetFooter className="mt-auto flex-row justify-end px-0">
          <Button type="button" variant="outline" onClick={onDone} disabled={update.isPending}>
            Cancel
          </Button>
          <SubmitButton pending={update.isPending}>Save</SubmitButton>
        </SheetFooter>
      </form>

      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </>
  );
}
