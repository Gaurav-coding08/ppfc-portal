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
import { useCreateCost, useUpdateCost } from '../hooks/useFinanceMutations';
import { useCostCategories } from '../hooks/useFinanceQueries';
import {
  COST_FORM_FIELDS,
  costFormSchema,
  toCreateCostBody,
  toUpdateCostBody,
  type CostFormValues,
} from '../schemas';
import type { Cost } from '../types';

// Add or edit a *draft* cost. Saving never posts: posting is a separate,
// confirmed action because a posted cost can't be changed afterwards.
export function CostFormSheet({
  open,
  onOpenChange,
  projectId,
  cost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  cost?: Cost;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open && <CostForm projectId={projectId} cost={cost} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function CostForm({ projectId, cost, onDone }: { projectId: number; cost?: Cost; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const categories = useCostCategories();
  const create = useCreateCost(projectId);
  const update = useUpdateCost();
  const pending = create.isPending || update.isPending;

  const form = useForm<CostFormValues>({
    resolver: zodResolver(costFormSchema),
    defaultValues: {
      categoryId: cost?.categoryId ? String(cost.categoryId) : '',
      txnDate: cost?.txnDate ?? '',
      amount: cost?.amount !== undefined ? String(cost.amount) : '',
      description: cost?.description ?? '',
      vendor: cost?.vendor ?? '',
    },
  });
  const { errors, dirtyFields } = form.formState;

  // Only active categories can be used (backend 422 otherwise). A draft
  // whose category was deactivated keeps it in the list so the select can
  // still show what it is.
  const categoryOptions = (categories.data ?? []).map((c) => ({ value: String(c.id), label: c.name ?? '' }));
  if (cost?.categoryId && !categoryOptions.some((o) => o.value === String(cost.categoryId))) {
    categoryOptions.push({ value: String(cost.categoryId), label: cost.categoryName ?? '' });
  }

  async function onSubmit(values: CostFormValues) {
    setFormError(null);
    try {
      if (cost) {
        const body = toUpdateCostBody(values, dirtyFields);
        if (Object.keys(body).length === 0) {
          onDone();
          return;
        }
        await update.mutateAsync({ id: cost.id!, body: { ...body, version: cost.version ?? 1 } });
        toast.success('Draft cost updated');
      } else {
        await create.mutateAsync(toCreateCostBody(values));
        toast.success('Draft cost added');
      }
      onDone();
    } catch (err) {
      if (isVersionConflict(err)) {
        setConflictOpen(true);
        return;
      }
      setFormError(applyServerErrors(err, form.setError, COST_FORM_FIELDS));
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{cost ? 'Edit draft cost' : 'Add cost'}</SheetTitle>
        <SheetDescription>
          Saved as a draft. Drafts don't count toward actual spend until they are posted.
        </SheetDescription>
      </SheetHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
        <Controller
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <SelectField
              label="Category"
              name="categoryId"
              required
              value={field.value}
              onChange={field.onChange}
              options={categoryOptions}
              error={errors.categoryId?.message}
            />
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <DateField label="Date" required {...form.register('txnDate')} error={errors.txnDate?.message} />
          <TextField
            label="Amount (AED)"
            required
            inputMode="decimal"
            {...form.register('amount')}
            error={errors.amount?.message}
          />
        </div>
        <TextField
          label="Description"
          required
          {...form.register('description')}
          error={errors.description?.message}
        />
        <TextField label="Vendor" {...form.register('vendor')} error={errors.vendor?.message} />

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
          <SubmitButton pending={pending}>{cost ? 'Save draft' : 'Add draft'}</SubmitButton>
        </SheetFooter>
      </form>
      <VersionConflictDialog open={conflictOpen} onOpenChange={setConflictOpen} />
    </>
  );
}
