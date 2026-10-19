import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

// CLAUDE.md typography: "KPI value 28/600." label is the caption above it.
//
// `hint`: a one-line definition shown in a tooltip on the info icon (and
// read out by screen readers as the icon's label).
// `onClick`: makes the whole card a button — e.g. Actual spend drills down
// to the transactions behind the number.
export function KpiCard({
  label,
  value,
  icon,
  hint,
  onClick,
  actionLabel,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  onClick?: () => void;
  /** Accessible name for the clickable card (defaults to the label). */
  actionLabel?: string;
  className?: string;
}) {
  const body = (
    <div className="min-w-0 text-left">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      {/* truncate is a last-resort guard; money values use <Money compact> so they fit. */}
      <p className="mt-1 truncate text-[28px] leading-tight font-semibold tabular-nums">{value}</p>
    </div>
  );

  return (
    <Card className={cn('p-5', onClick && 'hover:border-primary/40 transition-colors', className)}>
      <CardContent className="flex items-start justify-between gap-3 p-0">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            aria-label={actionLabel ?? label}
            className="focus-visible:ring-ring min-w-0 flex-1 rounded-md focus-visible:ring-2 focus-visible:outline-none"
          >
            {body}
          </button>
        ) : (
          body
        )}
        {(hint || icon) && (
          <div className="text-muted-foreground flex shrink-0 items-center gap-2">
            {icon}
            {hint && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button type="button" aria-label={`${label}: ${hint}`} className="rounded-sm">
                      <Info className="size-4" />
                    </button>
                  }
                />
                <TooltipContent>{hint}</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
