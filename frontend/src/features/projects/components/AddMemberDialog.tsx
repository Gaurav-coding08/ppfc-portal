import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SelectField } from '@/components/form/SelectField';
import { SubmitButton } from '@/components/form/SubmitButton';
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
import { useAddMember } from '../hooks/useProjectMutations';
import { useMemberCandidates } from '../hooks/useReferenceData';
import type { ProjectMember } from '../types';

const schema = z.object({
  userId: z.string().min(1, 'Choose a person'),
  memberRole: z.enum(['manager', 'contributor']),
});
type Values = z.infer<typeof schema>;

const ROLE_OPTIONS = [
  { value: 'contributor', label: 'Contributor' },
  { value: 'manager', label: 'Manager' },
];

export function AddMemberDialog({
  projectId,
  existing,
  open,
  onOpenChange,
}: {
  projectId: number;
  existing: ProjectMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <AddMemberForm projectId={projectId} existing={existing} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddMemberForm({
  projectId,
  existing,
  onDone,
}: {
  projectId: number;
  existing: ProjectMember[];
  onDone: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const candidates = useMemberCandidates(true);
  const add = useAddMember(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { userId: '', memberRole: 'contributor' },
  });

  // People already on the project are left out of the picker; the backend
  // would answer 409 for them anyway.
  const memberIds = new Set(existing.map((m) => m.userId));
  const options = (candidates.data ?? [])
    .filter((u) => !memberIds.has(u.id))
    .map((u) => ({ value: String(u.id), label: `${u.fullName ?? ''} (${u.email ?? ''})` }));

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await add.mutateAsync({ userId: Number(values.userId), memberRole: values.memberRole });
      toast.success('Member added');
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, form.setError, ['userId', 'memberRole']));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <DialogHeader>
        <DialogTitle>Add member</DialogTitle>
        <DialogDescription>
          Members can view this project. Contributors can be assigned tasks; managers can also manage it if
          their role is project manager.
        </DialogDescription>
      </DialogHeader>

      <Controller
        control={form.control}
        name="userId"
        render={({ field }) => (
          <SelectField
            label="Person"
            name="userId"
            required
            value={field.value}
            onChange={field.onChange}
            options={options}
            placeholder={candidates.isPending ? 'Loading…' : 'Select a person…'}
            error={form.formState.errors.userId?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="memberRole"
        render={({ field }) => (
          <SelectField
            label="Project role"
            name="memberRole"
            required
            value={field.value}
            onChange={field.onChange}
            options={ROLE_OPTIONS}
            error={form.formState.errors.memberRole?.message}
          />
        )}
      />

      {formError && (
        <p role="alert" className="text-sm text-rose-700">
          {formError}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={add.isPending}>
          Cancel
        </Button>
        <SubmitButton pending={add.isPending}>Add member</SubmitButton>
      </DialogFooter>
    </form>
  );
}
