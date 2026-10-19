import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { isVersionConflict } from '@/api/errors';
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
import { useResubmitCr } from '../hooks/useCrMutations';
import { RESUBMIT_FIELDS, resubmitSchema, type ResubmitValues } from '../schemas';
import type { ChangeRequestDetail } from '../types';

// The requester's edit-and-resubmit form for a returned CR. Only changed
// fields are sent (both are optional on the API); a cleared description is
// left out because the backend can't blank it (min length 1).
export function ResubmitSheet({
  open,
  onOpenChange,
  cr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cr: ChangeRequestDetail;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && <ResubmitForm cr={cr} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function ResubmitForm({ cr, onDone }: { cr: ChangeRequestDetail; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const resubmit = useResubmitCr(cr.id!);
  const form = useForm<ResubmitValues>({
    resolver: zodResolver(resubmitSchema),
    defaultValues: { title: cr.title ?? '', description: cr.description ?? '' },
  });
  const { errors, dirtyFields } = form.formState;

  async function onSubmit(values: ResubmitValues) {
    setFormError(null);
    try {
      await resubmit.mutateAsync({
        title: dirtyFields.title ? values.title : undefined,
        description: dirtyFields.description && values.description ? values.description : undefined,
        version: cr.version ?? 1,
      });
      toast.success(`${cr.code} resubmitted for review`);
      onDone();
    } catch (err) {
      if (isVersionConflict(err)) {
        setConflictOpen(true);
        return;
      }
      setFormError(applyServerErrors(err, form.setError, RESUBMIT_FIELDS));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Edit and resubmit {cr.code}</SheetTitle>
        <SheetDescription>
          Address the reviewer's reason, then resubmit. The request goes back to Submitted for a new decision.
        </SheetDescription>
      </SheetHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        {cr.decisionReason && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            <span className="font-medium">Returned because:</span> {cr.decisionReason}
          </div>
        )}
        <TextField label="Title" required {...form.register('title')} error={errors.title?.message} />
        <TextareaField
          label="Description"
          rows={5}
          {...form.register('description')}
          error={errors.description?.message}
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
          <Button type="button" variant="outline" onClick={onDone} disabled={resubmit.isPending}>
            Cancel
          </Button>
          <SubmitButton pending={resubmit.isPending}>Resubmit</SubmitButton>
        </SheetFooter>
      </form>
      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </>
  );
}
