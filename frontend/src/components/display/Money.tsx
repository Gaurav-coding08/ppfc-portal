import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';

export function Money({ amount, className }: { amount: number | string | null; className?: string }) {
  if (amount === null) return <span className={cn('text-muted-foreground tabular-nums', className)}>—</span>;
  return <span className={cn('tabular-nums', className)}>{formatMoney(amount)}</span>;
}
