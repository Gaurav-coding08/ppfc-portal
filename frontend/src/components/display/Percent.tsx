import { formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';

export function Percent({
  value,
  digits = 0,
  className,
}: {
  value: number | null | undefined;
  digits?: number;
  className?: string;
}) {
  return <span className={cn('tabular-nums', className)}>{formatPercent(value, digits)}</span>;
}
