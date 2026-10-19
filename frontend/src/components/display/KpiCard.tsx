import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';

// CLAUDE.md typography: "KPI value 28/600." label is the caption above it.
export function KpiCard({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('p-5', className)}>
      <CardContent className="flex items-start justify-between gap-3 p-0">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="mt-1 text-[28px] leading-tight font-semibold tabular-nums">{value}</p>
        </div>
        {icon && <div className="text-muted-foreground shrink-0">{icon}</div>}
      </CardContent>
    </Card>
  );
}
