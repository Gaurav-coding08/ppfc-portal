import { Progress } from '@/components/ui/progress';
import { Percent } from './Percent';
import { cn } from '@/lib/cn';

export function ProgressBar({
  value,
  showLabel = true,
  className,
}: {
  value: number | null;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Progress value={value ?? 0} className="flex-1" />
      {showLabel && (
        <Percent value={value} className="text-muted-foreground w-10 shrink-0 text-right text-xs" />
      )}
    </div>
  );
}
