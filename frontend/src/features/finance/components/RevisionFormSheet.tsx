import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DateField } from '@/components/form/DateField';
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
import { useRequestRevision } from '../hooks/useFinanceMutations';
import {
  REVISION_FORM_FIELDS,
  revisionFormSchema,
  toRevisionBody,
  type RevisionFormValues,
} from '../schemas';

// "Request revision" for project managers. The revision is created
// pending and has no effect on the approved budget until an admin
// approves it. A revision that would push the budget below zero comes
// back as a 422 and is shown above the buttons.
export function RevisionFormSheet({
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
        {open && <RevisionForm projectId={projectId} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function RevisionForm({ projectId, onDone }: { projectId: number; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const request = useRequestRevision(projectId);
  const form = useForm<RevisionFormValues>({
    resolver: zodResolver(revisionFormSchema),
    defaultValues: { amount: '', rationale: '', effectiveDate: '' },
  });
  const { errors } = form.formState;

  async function onSubmit(values: RevisionFormValues) {
    setFormError(null);
    try {
      await request.mutateAsync(toRevisionBody(values));
      toast.success('Budget revision requested');
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, REVISION_FORM_FIELDS));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Request budget revision</SheetTitle>
        <SheetDescription>
          The revision stays pending, and outside the approved budget, until an admin approves it.
        </SheetDescription>
      </SheetHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        <TextField
          label="Amount (AED)"
          required
          inputMode="decimal"
          description="Use a negative amount to reduce the budget."
          {...form.register('amount')}
          error={errors.amount?.message}
        />
        <DateField
          label="Effective date"
          required
          {...form.register('effectiveDate')}
          error={errors.effectiveDate?.message}
        />
        <TextareaField
          label="Rationale"
          required
          rows={4}
          description="At least 10 characters."
          {...form.register('rationale')}
          error={errors.rationale?.message}
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
          <Button type="button" variant="outline" onClick={onDone} disabled={request.isPending}>
            Cancel
          </Button>
          <SubmitButton pending={request.isPending}>Request revision</SubmitButton>
        </SheetFooter>
      </form>
    </>
  );
}
