import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ComponentProps } from 'react';

// CLAUDE.md "Double submit": buttons disable while a request is pending, so
// a slow network can't be mistaken for a missed click and double-tapped.
export function SubmitButton({
  pending,
  children,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Button>
  );
}
