import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { isVersionConflict } from '@/api/errors';
import { DateField } from '@/components/form/DateField';
import { SelectField } from '@/components/form/SelectField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { TextField } from '@/components/form/TextField';
import { VersionConflictDialog } from '@/components/form/VersionConflictDialog';
import { useReportingDate } from '@/components/layout/useReportingDate';
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
import { formatDate } from '@/lib/format';
import { useCreateMilestone, useUpdateMilestone } from '../hooks/useMilestones';
import {
  MILESTONE_FORM_FIELDS,
  milestoneFormSchema,
  toCreateBody,
  toUpdateBody,
  type MilestoneFormValues,
} from '../schemas';
import { MILESTONE_STATUS_OPTIONS, type Milestone } from '../types';

// Create/edit for project managers. Same shape as TaskFormSheet: mounted
// only while open, PATCH sends the changed fields plus the loaded version.
export function MilestoneFormSheet({
  open,
  onOpenChange,
  project,
  milestone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  milestone?: Milestone;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {open && <MilestoneForm project={project} milestone={milestone} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function MilestoneForm({
  project,
  milestone,
  onDone,
}: {
  project: ProjectDetail;
  milestone?: Milestone;
  onDone: () => void;
}) {
  const asOf = useReportingDate();
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const create = useCreateMilestone(project.id!);
  const update = useUpdateMilestone();
  const pending = create.isPending || update.isPending;

  const form = useForm<MilestoneFormValues>({
    resolver: zodResolver(
      milestoneFormSchema({ startDate: project.startDate, endDate: project.endDate, asOf }),
    ),
    defaultValues: {
      name: milestone?.name ?? '',
      dueDate: milestone?.dueDate ?? '',
      status: milestone?.status ?? 'planned',
      achievedDate: milestone?.achievedDate ?? '',
    },
  });
  const { errors, dirtyFields } = form.formState;

  async function onSubmit(values: MilestoneFormValues) {
    setFormError(null);
    try {
      if (milestone) {
        const body = toUpdateBody(values, dirtyFields);
        if (Object.keys(body).length === 0) {
          onDone();
          return;
        }
        await update.mutateAsync({ id: milestone.id!, body: { ...body, version: milestone.version ?? 1 } });
        toast.success('Milestone updated');
      } else {
        await create.mutateAsync(toCreateBody(values));
        toast.success('Milestone created');
      }
      onDone();
    } catch (err) {
      if (isVersionConflict(err)) {
        setConflictOpen(true);
        return;
      }
      setFormError(applyServerErrors(err, form.setError, MILESTONE_FORM_FIELDS));
    }
  }

  const projectWindow =
    project.startDate && project.endDate
      ? `Must fall between ${formatDate(project.startDate)} and ${formatDate(project.endDate)}.`
      : undefined;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{milestone ? 'Edit milestone' : 'New milestone'}</SheetTitle>
        <SheetDescription>Milestones mark key delivery dates on the project roadmap.</SheetDescription>
      </SheetHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        <TextField label="Name" required {...form.register('name')} error={errors.name?.message} />
        <DateField
          label="Due date"
          required
          description={projectWindow}
          {...form.register('dueDate')}
          error={errors.dueDate?.message}
        />
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
              options={MILESTONE_STATUS_OPTIONS}
              error={errors.status?.message}
            />
          )}
        />
        <DateField
          label="Achieved date"
          description="Required when the status is Achieved."
          {...form.register('achievedDate')}
          error={errors.achievedDate?.message}
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
          <SubmitButton pending={pending}>{milestone ? 'Save changes' : 'Create milestone'}</SubmitButton>
        </SheetFooter>
      </form>

      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </>
  );
}
