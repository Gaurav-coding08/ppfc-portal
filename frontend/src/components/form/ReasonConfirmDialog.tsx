import { Loader2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TextareaField } from './TextareaField';

// ConfirmDialog plus a required reason — for confirmations the backend
// records a reason for (reversing a cost, deciding a budget revision).
// The confirm button stays live so an empty reason shows an inline error
// instead of a silently disabled button. The parent decides when it
// closes (on success), so a failed request keeps the typed reason.
export function ReasonConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  reasonLabel = 'Reason',
  confirmLabel,
  onConfirm,
  pending = false,
  destructive = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  reasonLabel?: string;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  pending?: boolean;
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        {/* Mounted only while open, so every opening starts with an empty reason. */}
        {open && (
          <ReasonBody
            title={title}
            description={description}
            reasonLabel={reasonLabel}
            confirmLabel={confirmLabel}
            onConfirm={onConfirm}
            pending={pending}
            destructive={destructive}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReasonBody({
  title,
  description,
  reasonLabel,
  confirmLabel,
  onConfirm,
  pending,
  destructive,
}: {
  title: string;
  description: ReactNode;
  reasonLabel: string;
  confirmLabel: string;
  onConfirm: (reason: string) => void;
  pending: boolean;
  destructive: boolean;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  function confirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('A reason is required');
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <TextareaField
        label={reasonLabel}
        name="confirm-reason"
        required
        rows={3}
        value={reason}
        disabled={pending}
        onChange={(e) => {
          setReason(e.target.value);
          setError(undefined);
        }}
        error={error}
      />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant={destructive ? 'destructive' : 'default'}
          disabled={pending}
          onClick={confirm}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
