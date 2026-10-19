import type { ReactNode } from 'react';

// CLAUDE.md "Page header pattern: title + one-line description on the left,
// primary action on the right, filter bar below." The filter bar is a
// sibling the page renders itself, not a prop here.
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}
