import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

// The label + error-message shell every FormField wrapper shares. CLAUDE.md
// accessibility: "labels on every input" — every field gets a <Label
// htmlFor> tied to the control's id, not a bare placeholder.
export function Field({
  label,
  htmlFor,
  error,
  required,
  description,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {description && !error && <p className="text-muted-foreground text-xs">{description}</p>}
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
