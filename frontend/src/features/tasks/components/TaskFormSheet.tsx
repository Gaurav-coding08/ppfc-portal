import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { isVersionConflict } from '@/api/errors';
import { DateField } from '@/components/form/DateField';
import { Field } from '@/components/form/Field';
import { NumberField } from '@/components/form/NumberField';
import { SelectField, type SelectOption } from '@/components/form/SelectField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { TextareaField } from '@/components/form/TextareaField';
import { TextField } from '@/components/form/TextField';
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
import type { ProjectDetail } from '@/features/projects/types';
import { applyServerErrors } from '@/lib/applyServerErrors';
import { useCreateTask, useUpdateTask } from '../hooks/useTaskMutations';
import {
  TASK_FORM_FIELDS,
  taskFormSchema,
  toCreateBody,
  toUpdateBody,
  type TaskFormValues,
} from '../schemas';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS, UNASSIGNED, type TaskRow } from '../types';
import { ProgressInput } from './ProgressInput';

// The full create/edit form, for people who can manage the project. A
// contributor editing their own task gets ContributorTaskSheet instead.
// Like ProjectFormSheet, the form only mounts while open, so every open
// starts from the task's current values.
export function TaskFormSheet({
  open,
  onOpenChange,
  project,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  task?: TaskRow;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && <TaskForm project={project} task={task} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function TaskForm({ project, task, onDone }: { project: ProjectDetail; task?: TaskRow; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const create = useCreateTask(project.id!);
  const update = useUpdateTask();
  const pending = create.isPending || update.isPending;

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema({ startDate: project.startDate, endDate: project.endDate })),
    defaultValues: {
      title: task?.title ?? '',
      description: task?.description ?? '',
      assigneeId: task?.assigneeId ? String(task.assigneeId) : UNASSIGNED,
      status: task?.status ?? 'todo',
      priority: task?.priority ?? 'medium',
      startDate: task?.startDate ?? '',
      dueDate: task?.dueDate ?? '',
      weight: task?.weight ?? 1,
      progress: task?.progress ?? 0,
    },
  });
  const { errors, dirtyFields } = form.formState;

  async function onSubmit(values: TaskFormValues) {
    setFormError(null);
    try {
      if (task) {
        const body = toUpdateBody(values, dirtyFields);
        if (Object.keys(body).length === 0) {
          onDone();
          return;
        }
        await update.mutateAsync({ id: task.id!, body: { ...body, version: task.version ?? 1 } });
        toast.success('Task updated');
      } else {
        await create.mutateAsync(toCreateBody(values));
        toast.success('Task created');
      }
      onDone();
    } catch (err) {
      // 409: someone else saved first. Never resubmit with a fresh version.
      if (isVersionConflict(err)) {
        setConflictOpen(true);
        return;
      }
      setFormError(applyServerErrors(err, form.setError, TASK_FORM_FIELDS));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{task ? 'Edit task' : 'New task'}</SheetTitle>
        <SheetDescription>
          Only project members can be assigned. Weight sets how much this task counts toward project progress.
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        <TextField label="Title" required {...form.register('title')} error={errors.title?.message} />
        <TextareaField
          label="Description"
          rows={3}
          {...form.register('description')}
          error={errors.description?.message}
        />

        <Controller
          control={form.control}
          name="assigneeId"
          render={({ field }) => (
            <SelectField
              label="Assignee"
              name="assigneeId"
              value={field.value}
              onChange={field.onChange}
              options={assigneeOptions(project, task)}
              error={errors.assigneeId?.message}
            />
          )}
        />

        <div className="grid grid-cols-2 gap-4">
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
            name="priority"
            render={({ field }) => (
              <SelectField
                label="Priority"
                name="priority"
                required
                value={field.value}
                onChange={field.onChange}
                options={TASK_PRIORITY_OPTIONS}
                error={errors.priority?.message}
              />
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <DateField label="Start date" {...form.register('startDate')} error={errors.startDate?.message} />
          <DateField
            label="Due date"
            required
            {...form.register('dueDate')}
            error={errors.dueDate?.message}
          />
        </div>

        <NumberField
          label="Weight"
          required
          min={0}
          step="0.5"
          {...form.register('weight', { valueAsNumber: true })}
          error={errors.weight?.message}
        />

        <Controller
          control={form.control}
          name="progress"
          render={({ field }) => (
            <Field
              label="Progress"
              htmlFor="progress"
              error={errors.progress?.message}
              description="Setting status to Done makes progress 100 %."
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
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <SubmitButton pending={pending}>{task ? 'Save changes' : 'Create task'}</SubmitButton>
        </SheetFooter>
      </form>

      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </>
  );
}

// Assignees are limited to project members (backend 422 otherwise). A task
// whose assignee has since left keeps that person in the list so the
// select can still show who it is.
function assigneeOptions(project: ProjectDetail, task?: TaskRow): SelectOption[] {
  const options: SelectOption[] = [
    { value: UNASSIGNED, label: 'Unassigned' },
    ...(project.members ?? []).map((m) => ({ value: String(m.userId), label: m.fullName ?? '' })),
  ];
  if (task?.assigneeId && !options.some((o) => o.value === String(task.assigneeId))) {
    options.push({ value: String(task.assigneeId), label: task.assigneeName ?? `User ${task.assigneeId}` });
  }
  return options;
}
