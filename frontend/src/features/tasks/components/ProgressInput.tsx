import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

// Progress as a slider plus a number box, both bound to the same value, so
// it can be dragged roughly or typed exactly. A controlled component: pair
// it with react-hook-form's <Controller>. An emptied number box reports
// NaN, which the form's zod schema rejects ("Progress is required").
export function ProgressInput({
  id,
  label,
  value,
  onChange,
  invalid,
  disabled,
  className,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        aria-label={`${label} slider`}
        value={Number.isNaN(value) ? 0 : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        disabled={disabled}
        className="h-2 flex-1 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed"
      />
      <div className="flex items-center gap-1">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          aria-label={label}
          aria-invalid={invalid}
          value={Number.isNaN(value) ? '' : value}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          disabled={disabled}
          className="w-20 tabular-nums"
        />
        <span className="text-muted-foreground text-sm">%</span>
      </div>
    </div>
  );
}
