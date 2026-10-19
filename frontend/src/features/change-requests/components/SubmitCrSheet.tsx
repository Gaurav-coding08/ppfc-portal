import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { SubmitButton } from '@/components/form/SubmitButton';
import { TextareaField } from '@/components/form/TextareaField';
import { TextField } from '@/components/form/TextField';
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
import { useSubmitCr } from '../hooks/useCrMutations';
import { SUBMIT_CR_FIELDS, submitCrSchema, toSubmitBody, type SubmitCrValues } from '../schemas';

// Any project member — contributors included — can raise a change request.
// On success the user lands on the new CR's detail page.
export function SubmitCrSheet({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && <SubmitCrForm projectId={projectId} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function SubmitCrForm({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const submit = useSubmitCr(projectId);
  const form = useForm<SubmitCrValues>({
    resolver: zodResolver(submitCrSchema),
    defaultValues: { title: '', description: '', impactSummary: '' },
  });
  const { errors } = form.formState;

  async function onSubmit(values: SubmitCrValues) {
    setFormError(null);
    try {
      const cr = await submit.mutateAsync(toSubmitBody(values));
      toast.success(`${cr.code} submitted for review`);
      onDone();
      navigate(`/change-requests/${cr.id}`);
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, SUBMIT_CR_FIELDS));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Submit a change request</SheetTitle>
        <SheetDescription>
          A project manager reviews it and approves, rejects or returns it with a reason. Approval records the
          decision only — it does not change the budget or costs.
        </SheetDescription>
      </SheetHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        <TextField label="Title" required {...form.register('title')} error={errors.title?.message} />
        <TextareaField
          label="Description"
          rows={4}
          {...form.register('description')}
          error={errors.description?.message}
        />
        <TextareaField
          label="Impact summary"
          rows={3}
          description="Scope, schedule or cost impact, in a sentence or two."
          {...form.register('impactSummary')}
          error={errors.impactSummary?.message}
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
          <Button type="button" variant="outline" onClick={onDone} disabled={submit.isPending}>
            Cancel
          </Button>
          <SubmitButton pending={submit.isPending}>Submit</SubmitButton>
        </SheetFooter>
      </form>
    </>
  );
}
