import { formatPercent, formatRatio } from '@/lib/format';
import { cn } from '@/lib/cn';

// `kind="percent"` (default): the value is already 0–100 (e.g. progressPct).
// `kind="ratio"`: the value is a fraction (e.g. utilization 0.94) — see
// lib/format.ts#formatRatio.
export function Percent({
  value,
  digits = 0,
  kind = 'percent',
  className,
}: {
  value: number | null | undefined;
  digits?: number;
  kind?: 'percent' | 'ratio';
  className?: string;
}) {
  const text = kind === 'ratio' ? formatRatio(value, digits) : formatPercent(value, digits);
  return <span className={cn('tabular-nums', className)}>{text}</span>;
}
