import { Lock } from 'lucide-react';

// Shown when the backend returns 403 on a view the user navigated to
// directly (not a hidden button they bypassed) — CLAUDE.md "always handle a
// 403 gracefully — the backend decides."
export function ForbiddenState({ message = "You don't have access to this." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
      <div className="bg-muted flex size-10 items-center justify-center rounded-full">
        <Lock className="text-muted-foreground size-5" />
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
