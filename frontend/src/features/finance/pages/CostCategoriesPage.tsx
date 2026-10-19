import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Tags } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { isAdmin } from '@/auth/can';
import { useAuth } from '@/auth/useAuth';
import { EmptyState } from '@/components/data/EmptyState';
import { ErrorState } from '@/components/data/ErrorState';
import { ForbiddenState } from '@/components/data/ForbiddenState';
import { LoadingState } from '@/components/data/LoadingState';
import { ToneBadge } from '@/components/display/ToneBadge';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { SubmitButton } from '@/components/form/SubmitButton';
import { TextField } from '@/components/form/TextField';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { applyServerErrors } from '@/lib/applyServerErrors';
import { toastApiError } from '@/lib/notify';
import { useCreateCategory, useUpdateCategory } from '../hooks/useFinanceMutations';
import { useCostCategories } from '../hooks/useFinanceQueries';
import { CATEGORY_FORM_FIELDS, categoryFormSchema, type CategoryFormValues } from '../schemas';
import type { CostCategory } from '../types';

// Admin-only: create, rename and (de)activate cost categories. There is no
// delete in the API — a category is deactivated instead, which the
// backend refuses while draft costs still use it (422, shown as a toast).
export function CostCategoriesPage() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const categories = useCostCategories(true);
  const update = useUpdateCategory();
  const [editing, setEditing] = useState<CostCategory | 'new' | null>(null);
  const [toToggle, setToToggle] = useState<CostCategory | null>(null);

  // UI hint only: the backend also refuses non-admin writes with 403.
  if (!admin) return <ForbiddenState message="Only admins can manage cost categories." />;

  async function confirmToggle() {
    if (!toToggle) return;
    try {
      await update.mutateAsync({ id: toToggle.id!, body: { isActive: !toToggle.isActive } });
      toast.success(toToggle.isActive ? 'Category deactivated' : 'Category reactivated');
    } catch (err) {
      toastApiError(err);
    } finally {
      setToToggle(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cost categories"
        description="Categories available when recording project costs."
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" />
            New category
          </Button>
        }
      />

      {categories.isPending ? (
        <LoadingState rows={4} />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : categories.data.length === 0 ? (
        <EmptyState icon={Tags} message="No cost categories yet." />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <Table aria-label="Cost categories">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.data.map((c) => (
                  <TableRow key={c.id} className={c.isActive ? undefined : 'text-muted-foreground'}>
                    <TableCell className="pl-5 font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <ToneBadge tone={c.isActive ? 'success' : 'neutral'}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </ToneBadge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Rename ${c.name}`}
                          onClick={() => setEditing(c)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setToToggle(c)}>
                          {c.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <CategoryDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        category={editing === 'new' || editing === null ? undefined : editing}
      />
      <ConfirmDialog
        open={toToggle !== null}
        onOpenChange={(open) => !open && setToToggle(null)}
        title={toToggle?.isActive ? 'Deactivate this category?' : 'Reactivate this category?'}
        description={
          toToggle?.isActive
            ? `"${toToggle?.name ?? ''}" can no longer be used for new costs. Existing posted costs keep it. It can't be deactivated while draft costs use it.`
            : `"${toToggle?.name ?? ''}" becomes available for new costs again.`
        }
        confirmLabel={toToggle?.isActive ? 'Deactivate' : 'Reactivate'}
        pending={update.isPending}
        onConfirm={confirmToggle}
      />
    </div>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CostCategory;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <CategoryForm category={category} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ category, onDone }: { category?: CostCategory; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const pending = create.isPending || update.isPending;
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { code: category?.code ?? '', name: category?.name ?? '' },
  });
  const { errors, dirtyFields } = form.formState;

  async function onSubmit(values: CategoryFormValues) {
    setFormError(null);
    try {
      if (category) {
        const body: { code?: string; name?: string } = {};
        if (dirtyFields.code) body.code = values.code.trim();
        if (dirtyFields.name) body.name = values.name.trim();
        if (Object.keys(body).length === 0) {
          onDone();
          return;
        }
        await update.mutateAsync({ id: category.id!, body });
        toast.success('Category updated');
      } else {
        await create.mutateAsync({ code: values.code.trim(), name: values.name.trim() });
        toast.success('Category created');
      }
      onDone();
    } catch (err) {
      // Duplicate code/name comes back as a 4xx with a message.
      setFormError(applyServerErrors(err, form.setError, CATEGORY_FORM_FIELDS));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>{category ? 'Rename category' : 'New cost category'}</DialogTitle>
        <DialogDescription>Codes and names must be unique.</DialogDescription>
      </DialogHeader>
      <TextField label="Code" required {...form.register('code')} error={errors.code?.message} />
      <TextField label="Name" required {...form.register('name')} error={errors.name?.message} />
      {formError && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200"
        >
          {formError}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <SubmitButton pending={pending}>{category ? 'Save' : 'Create'}</SubmitButton>
      </DialogFooter>
    </form>
  );
}
