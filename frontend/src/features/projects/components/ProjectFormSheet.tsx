import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { isVersionConflict } from '@/api/errors';
import { isAdmin } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { DateField } from '@/components/form/DateField';
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
import { applyServerErrors } from '@/lib/applyServerErrors';
import { useCreateProject, useUpdateProject } from '../hooks/useProjectMutations';
import { useDepartmentOptions, useOwnerOptions } from '../hooks/useReferenceData';
import {
  PROJECT_FORM_FIELDS,
  projectFormSchema,
  toCreateBody,
  toUpdateBody,
  type ProjectFormValues,
} from '../schemas';
import { PROJECT_STATUS_OPTIONS, type ProjectDetail } from '../types';

// One sheet for both create and edit. Passing `project` switches it to edit
// mode: fields are pre-filled, the budget field is hidden, and the PATCH
// carries `project.version` — the version this form was loaded with.
//
// The sheet's content is only mounted while open, so every open starts
// from fresh default values (no stale draft from a previous edit). It also
// waits for the session: react-hook-form reads `defaultValues` once, and a
// PM's owner field defaults to their own id.
export function ProjectFormSheet({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectDetail;
}) {
  const { user } = useAuth();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && user && <ProjectForm project={project} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function ProjectForm({ project, onDone }: { project?: ProjectDetail; onDone: () => void }) {
  const mode = project ? 'edit' : 'create';
  const { user } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  const departments = useDepartmentOptions();
  // A PM may only create projects they own themselves (backend → 403
  // otherwise), so on create a PM gets a fixed owner field instead of a
  // directory lookup. Admins — and a PM editing an existing project — pick
  // from the eligible-owner list.
  const ownerLockedToSelf = mode === 'create' && !isAdmin(user);
  const owners = useOwnerOptions(!ownerLockedToSelf);
  const ownerOptions = withCurrent(
    ownerLockedToSelf ? [] : owners.options,
    ownerLockedToSelf && user
      ? { value: String(user.id), label: user.fullName ?? '' }
      : projectOwnerOption(project),
  );

  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? 0);
  const pending = create.isPending || update.isPending;

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema(mode)),
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      departmentId: project?.department?.id ? String(project.department.id) : '',
      ownerId: project?.owner?.id
        ? String(project.owner.id)
        : ownerLockedToSelf && user
          ? String(user.id)
          : '',
      status: project?.status ?? 'planning',
      startDate: project?.startDate ?? '',
      endDate: project?.endDate ?? '',
      initialBudget: undefined,
    },
  });
  const { errors } = form.formState;

  async function onSubmit(values: ProjectFormValues) {
    setFormError(null);
    try {
      if (project) {
        await update.mutateAsync(toUpdateBody(values, project.version ?? 1));
        toast.success('Project updated');
        onDone();
      } else {
        const created = await create.mutateAsync(toCreateBody(values));
        toast.success(`Project ${created.code ?? ''} created`);
        onDone();
        if (created.id) navigate(`/projects/${created.id}`);
      }
    } catch (err) {
      // 409: someone else saved first. Never resubmit with a fresh version
      // automatically — the user reloads and re-applies their change.
      if (isVersionConflict(err)) {
        setConflictOpen(true);
        return;
      }
      setFormError(applyServerErrors(err, form.setError, PROJECT_FORM_FIELDS));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{project ? `Edit ${project.code}` : 'New project'}</SheetTitle>
        <SheetDescription>
          {project
            ? 'Budget changes go through budget revisions, not this form.'
            : 'The owner becomes the project manager. The initial budget is fixed once created.'}
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        <TextField label="Name" required {...form.register('name')} error={errors.name?.message} />
        <TextareaField
          label="Description"
          rows={3}
          {...form.register('description')}
          error={errors.description?.message}
        />

        <Controller
          control={form.control}
          name="departmentId"
          render={({ field }) => (
            <SelectField
              label="Department"
              name="departmentId"
              required
              value={field.value}
              onChange={field.onChange}
              options={departments.data ?? []}
              error={errors.departmentId?.message}
            />
          )}
        />
        <Controller
          control={form.control}
          name="ownerId"
          render={({ field }) => (
            <SelectField
              label="Owner"
              name="ownerId"
              required
              value={field.value}
              onChange={field.onChange}
              options={ownerOptions}
              disabled={ownerLockedToSelf}
              description={ownerLockedToSelf ? 'Project managers own the projects they create.' : undefined}
              error={errors.ownerId?.message}
            />
          )}
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
              options={PROJECT_STATUS_OPTIONS}
              error={errors.status?.message}
            />
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <DateField
            label="Start date"
            required
            {...form.register('startDate')}
            error={errors.startDate?.message}
          />
          <DateField
            label="End date"
            required
            {...form.register('endDate')}
            error={errors.endDate?.message}
          />
        </div>

        {mode === 'create' && (
          <NumberField
            label="Initial approved budget (AED)"
            required
            min={0}
            step="0.01"
            {...form.register('initialBudget', { valueAsNumber: true })}
            error={errors.initialBudget?.message}
          />
        )}

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
          <SubmitButton pending={pending}>{project ? 'Save changes' : 'Create project'}</SubmitButton>
        </SheetFooter>
      </form>

      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </>
  );
}

function projectOwnerOption(project?: ProjectDetail): SelectOption | null {
  if (!project?.owner?.id) return null;
  return { value: String(project.owner.id), label: project.owner.fullName ?? '' };
}

// The current owner may be outside the caller's directory scope (a PM's
// `GET /users` only covers projects they manage), so make sure the select
// can still display them.
function withCurrent(options: SelectOption[], current: SelectOption | null): SelectOption[] {
  if (!current || options.some((o) => o.value === current.value)) return options;
  return [current, ...options];
}
