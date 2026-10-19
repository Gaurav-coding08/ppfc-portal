import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { cn } from '@/lib/cn';

// `compact`: show "AED 375K" (KPI cards, where space is fixed). The exact
// amount stays available as the hover title and as screen-reader text, so
// abbreviation never hides the real figure.
export function Money({
  amount,
  compact = false,
  className,
}: {
  amount: number | string | null;
  compact?: boolean;
  className?: string;
}) {
  if (amount === null) return <span className={cn('text-muted-foreground tabular-nums', className)}>—</span>;
  const full = formatMoney(amount);
  if (!compact) return <span className={cn('tabular-nums', className)}>{full}</span>;
  return (
    <span className={cn('tabular-nums', className)} title={full}>
      <span aria-hidden>{formatMoneyCompact(amount)}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}
