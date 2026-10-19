import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from '@/api/errors';
import type { SelectOption } from '@/components/form/SelectField';
import { SelectField } from '@/components/form/SelectField';
import { SubmitButton } from '@/components/form/SubmitButton';
import { TextField } from '@/components/form/TextField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { applyServerErrors } from '@/lib/applyServerErrors';
import { useCreateUser } from '../hooks/useAdminMutations';
import { CREATE_USER_FIELDS, createUserSchema, toCreateUserBody, type CreateUserValues } from '../schemas';
import { ROLE_OPTIONS } from '../types';

export function CreateUserDialog({
  open,
  onOpenChange,
  departments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: SelectOption[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so every open starts with an empty form. */}
        {open && <CreateUserForm departments={departments} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateUserForm({ departments, onDone }: { departments: SelectOption[]; onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const create = useCreateUser();
  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { fullName: '', email: '', role: 'contributor', departmentId: '', password: '' },
  });
  const { errors } = form.formState;

  async function onSubmit(values: CreateUserValues) {
    setFormError(null);
    try {
      const created = await create.mutateAsync(toCreateUserBody(values));
      toast.success(`User ${created.fullName ?? ''} created`);
      onDone();
    } catch (err) {
      // A duplicate email is a 409 (IDEMPOTENCY_CONFLICT, the backend's
      // generic conflict code) with no field details — pin it to Email.
      if (err instanceof ApiError && err.code === 'IDEMPOTENCY_CONFLICT') {
        form.setError('email', { type: 'server', message: err.message });
        return;
      }
      setFormError(applyServerErrors(err, form.setError, CREATE_USER_FIELDS));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>New user</DialogTitle>
        <DialogDescription>The user signs in with this email and the initial password.</DialogDescription>
      </DialogHeader>
      <TextField label="Full name" required {...form.register('fullName')} error={errors.fullName?.message} />
      <TextField
        label="Email"
        type="email"
        autoComplete="off"
        required
        {...form.register('email')}
        error={errors.email?.message}
      />
      <Controller
        control={form.control}
        name="role"
        render={({ field }) => (
          <SelectField
            label="Role"
            name="role"
            required
            value={field.value}
            onChange={field.onChange}
            options={ROLE_OPTIONS}
            error={errors.role?.message}
          />
        )}
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
            options={departments}
            error={errors.departmentId?.message}
          />
        )}
      />
      <TextField
        label="Initial password"
        type="password"
        autoComplete="new-password"
        required
        description="At least 8 characters, with a letter and a digit."
        {...form.register('password')}
        error={errors.password?.message}
      />
      {formError && (
        <p
          role="alert"
          className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200"
        >
          {formError}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={create.isPending}>
          Cancel
        </Button>
        <SubmitButton pending={create.isPending}>Create user</SubmitButton>
      </DialogFooter>
    </form>
  );
}
