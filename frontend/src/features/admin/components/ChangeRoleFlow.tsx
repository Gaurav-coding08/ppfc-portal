import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError, isVersionConflict } from '@/api/errors';
import { ConfirmDialog } from '@/components/form/ConfirmDialog';
import { SelectField } from '@/components/form/SelectField';
import { VersionConflictDialog } from '@/components/form/VersionConflictDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateUser } from '../hooks/useAdminMutations';
import { ROLE_OPTIONS, roleLabel, type AdminUser, type Role } from '../types';

const ROLE_CONSEQUENCE: Record<Role, string> = {
  contributor:
    'They will only be able to view their projects, update their own tasks and submit change requests.',
  project_manager:
    'They will be able to manage projects they own or manage, including costs and change-request decisions.',
  admin:
    'They will have full access, including user management, cost categories and budget-revision decisions.',
};

// Two steps, one after the other (never stacked): pick the new role, then a
// ConfirmDialog that states the consequence (CLAUDE.md "changing a user's
// role → ConfirmDialog"). Nothing is sent until the confirm. The backend
// refuses an admin changing their own role and demoting the last active
// admin (422) — that message is shown back on the pick step as-is.
// The parent mounts this per target user (`key={user.id}`), so each open
// starts fresh.
export function ChangeRoleFlow({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [step, setStep] = useState<'pick' | 'confirm' | 'conflict'>('pick');
  const [role, setRole] = useState<string>(user.role ?? '');
  const [error, setError] = useState<ApiError | null>(null);
  const update = useUpdateUser();

  async function confirm() {
    try {
      await update.mutateAsync({ id: user.id!, body: { role: role as Role, version: user.version! } });
      toast.success(`${user.fullName} is now ${roleLabel(role)}`);
      onClose();
    } catch (err) {
      if (isVersionConflict(err)) {
        setStep('conflict');
        return;
      }
      setError(err instanceof ApiError ? err : null);
      setStep('pick');
    }
  }

  return (
    <>
      <Dialog open={step === 'pick'} onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {user.fullName} is currently {roleLabel(user.role)}.
            </DialogDescription>
          </DialogHeader>
          <SelectField label="New role" name="role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200"
            >
              <p>{error.message}</p>
              {error.requestId && <p className="mt-1 text-xs opacity-80">Request ID: {error.requestId}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!role || role === user.role}
              onClick={() => {
                setError(null);
                setStep('confirm');
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={step === 'confirm'}
        onOpenChange={(open) => !open && setStep('pick')}
        title={`Make ${user.fullName} ${roleLabel(role)}?`}
        description={role ? ROLE_CONSEQUENCE[role as Role] : ''}
        confirmLabel="Change role"
        pending={update.isPending}
        onConfirm={confirm}
      />
      <VersionConflictDialog open={step === 'conflict'} onOpenChange={(open) => !open && onClose()} />
    </>
  );
}
