import { toast } from 'sonner';
import { ApiError } from '@/api/errors';

// CLAUDE.md "show requestId in small text on error states and toasts so a
// failure can be traced in the logs".
export function toastApiError(err: unknown, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof ApiError) {
    toast.error(err.message, {
      description: err.requestId ? `Request ID: ${err.requestId}` : undefined,
    });
  } else {
    toast.error(fallback);
  }
}
