import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/api/errors';

// CLAUDE.md: "Error: message + requestId + Retry." The requestId is shown
// in small text so a failure can be traced in the backend logs.
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
  const requestId = error instanceof ApiError ? error.requestId : undefined;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-rose-50">
        <AlertTriangle className="size-5 text-rose-600" />
      </div>
      <p className="text-sm text-slate-900">{message}</p>
      {requestId && <p className="text-muted-foreground text-xs">Request ID: {requestId}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
