import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError, isVersionConflict } from '@/api/errors';
import { ExposureBadge } from '@/components/display/ExposureBadge';
import { DateField } from '@/components/form/DateField';
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
import { useCreateRisk, useUpdateRisk } from '../hooks/useRiskMutations';
import {
  RISK_FORM_FIELDS,
  riskFormSchema,
  toCreateBody,
  toUpdateBody,
  type RiskFormValues,
} from '../schemas';
import { mitigationRequired, previewBand, previewScore } from '../scorePreview';
import { RATING_OPTIONS, RISK_STATUS_OPTIONS, RISK_TYPE_OPTIONS, type Risk } from '../types';

// Create/edit form for people who can manage the project. Like the task
// form, it only mounts while open so each open starts from current values.
export function RiskFormSheet({
  open,
  onOpenChange,
  project,
  risk,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  risk?: Risk;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && <RiskForm project={project} risk={risk} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function RiskForm({ project, risk, onDone }: { project: ProjectDetail; risk?: Risk; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const create = useCreateRisk(project.id!);
  const update = useUpdateRisk();
  const pending = create.isPending || update.isPending;

  const form = useForm<RiskFormValues>({
    resolver: zodResolver(riskFormSchema),
    defaultValues: {
      type: risk?.type ?? 'risk',
      title: risk?.title ?? '',
      description: risk?.description ?? '',
      ownerId: risk?.ownerId ? String(risk.ownerId) : '',
      probability: risk?.probability ? String(risk.probability) : '',
      impact: risk?.impact ? String(risk.impact) : '',
      mitigation: risk?.mitigation ?? '',
      dueDate: risk?.dueDate ?? '',
      status: risk?.status ?? 'open',
    },
  });
  const { errors, dirtyFields } = form.formState;
  const probability = useWatch({ control: form.control, name: 'probability' });
  const impact = useWatch({ control: form.control, name: 'impact' });
  const score = previewScore(Number(probability), Number(impact));
  const needsMitigation = mitigationRequired(score);

  async function onSubmit(values: RiskFormValues) {
    setFormError(null);
    try {
      if (risk) {
        const body = toUpdateBody(values, dirtyFields);
        if (Object.keys(body).length === 0) {
          onDone();
          return;
        }
        await update.mutateAsync({ id: risk.id!, body: { ...body, version: risk.version ?? 1 } });
        toast.success('Risk updated');
      } else {
        await create.mutateAsync(toCreateBody(values));
        toast.success('Risk created');
      }
      onDone();
    } catch (err) {
      // 409: someone else saved first. Never resubmit with a fresh version.
      if (isVersionConflict(err)) {
        setConflictOpen(true);
        return;
      }
      const field = businessRuleField(err);
      if (field) {
        form.setError(field, { type: 'server', message: (err as ApiError).message });
        return;
      }
      setFormError(applyServerErrors(err, form.setError, RISK_FORM_FIELDS));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{risk ? 'Edit risk' : 'New risk'}</SheetTitle>
        <SheetDescription>
          Score is probability × impact. Risks scoring 15 or more are high exposure and must record a
          mitigation.
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <SelectField
                label="Type"
                name="type"
                required
                value={field.value}
                onChange={field.onChange}
                options={RISK_TYPE_OPTIONS}
                error={errors.type?.message}
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
                options={statusOptions(risk)}
                error={errors.status?.message}
              />
            )}
          />
        </div>

        <TextField label="Title" required {...form.register('title')} error={errors.title?.message} />
        <TextareaField
          label="Description"
          rows={3}
          {...form.register('description')}
          error={errors.description?.message}
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
              options={ownerOptions(project, risk)}
              description="Owners must be members of this project."
              error={errors.ownerId?.message}
            />
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <RatingSelect
            control={form.control}
            name="probability"
            label="Probability"
            error={errors.probability?.message}
          />
          <RatingSelect control={form.control} name="impact" label="Impact" error={errors.impact?.message} />
        </div>

        <ScorePreview score={score} />

        <TextareaField
          label="Mitigation"
          rows={3}
          required={needsMitigation}
          description={
            needsMitigation
              ? 'Required for high-exposure risks. An unmitigated high risk cannot be updated (even closed) until a mitigation is recorded.'
              : undefined
          }
          {...form.register('mitigation')}
          error={errors.mitigation?.message}
        />

        <DateField label="Due date" {...form.register('dueDate')} error={errors.dueDate?.message} />

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
          <SubmitButton pending={pending}>{risk ? 'Save changes' : 'Create risk'}</SubmitButton>
        </SheetFooter>
      </form>

      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </>
  );
}

function RatingSelect({
  control,
  name,
  label,
  error,
}: {
  control: Control<RiskFormValues>;
  name: 'probability' | 'impact';
  label: string;
  error?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SelectField
          label={label}
          name={name}
          required
          value={field.value}
          onChange={field.onChange}
          options={RATING_OPTIONS}
          placeholder="1–5"
          error={error}
        />
      )}
    />
  );
}

// Display-only preview (see scorePreview.ts): the saved score and band
// always come back from the API.
function ScorePreview({ score }: { score: number | null }) {
  return (
    <div
      className="bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2 text-sm"
      aria-live="polite"
    >
      <span className="text-muted-foreground">Score preview (calculated on save)</span>
      {score === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="flex items-center gap-2">
          <span className="font-medium tabular-nums">{score}</span>
          <ExposureBadge exposure={previewBand(score)} />
        </span>
      )}
    </div>
  );
}

// The backend's 422 BUSINESS_RULE errors on this endpoint carry no
// `details` naming the field, only a message ("Mitigation is required…",
// "Owner must be a member…"). Matching the message lets the form show it
// next to the field it's about; anything else falls back to the
// form-level banner.
function businessRuleField(err: unknown): 'mitigation' | 'ownerId' | null {
  if (!(err instanceof ApiError) || err.code !== 'BUSINESS_RULE') return null;
  if (/mitigation/i.test(err.message)) return 'mitigation';
  if (/owner/i.test(err.message)) return 'ownerId';
  return null;
}

// Closing goes through the table's Close action, which asks for
// confirmation first, so the form only offers Closed for a risk that is
// already closed (to keep it, or reopen it).
function statusOptions(risk?: Risk) {
  return risk?.status === 'closed'
    ? RISK_STATUS_OPTIONS
    : RISK_STATUS_OPTIONS.filter((o) => o.value !== 'closed');
}

// Owners are limited to project members (backend 422 otherwise). An owner
// who has since left the project stays in the list so the select can
// still show who it is.
function ownerOptions(project: ProjectDetail, risk?: Risk): SelectOption[] {
  const options = (project.members ?? []).map((m) => ({ value: String(m.userId), label: m.fullName ?? '' }));
  if (risk?.ownerId && !options.some((o) => o.value === String(risk.ownerId))) {
    options.push({ value: String(risk.ownerId), label: risk.ownerName ?? `User ${risk.ownerId}` });
  }
  return options;
}
