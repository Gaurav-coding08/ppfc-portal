import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// CLAUDE.md "Concurrency": on 409 VERSION_CONFLICT show this dialog. "Never
// auto-retry with a fresh version" — the only action is a full reload,
// which re-fetches the current version instead of silently resubmitting.
export function VersionConflictDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This record was changed by someone else</DialogTitle>
          <DialogDescription>
            Someone else saved changes to this record while you were editing it. Reload to see the latest
            version before trying again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
