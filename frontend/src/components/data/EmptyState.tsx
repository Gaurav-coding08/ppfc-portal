import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

// CLAUDE.md: "Empty states: small lucide icon in a muted circle, one
// sentence, one action."
export function EmptyState({
  icon: Icon = Inbox,
  message,
  action,
}: {
  icon?: LucideIcon;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
      <div className="bg-muted flex size-10 items-center justify-center rounded-full">
        <Icon className="text-muted-foreground size-5" />
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
      {action}
    </div>
  );
}
