import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SelectOption } from '@/components/form/SelectField';

// A FilterBar dropdown that allows several values at once. The value is the
// comma-separated string the URL (and the backend's `?status=a,b` filter)
// already uses, so it plugs into `useUrlFilters` like FilterSelect does.
// '' = no filter.
export function FilterMultiSelect({
  label,
  allLabel,
  value,
  onChange,
  options,
}: {
  label: string;
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
  const selected = value ? value.split(',') : [];

  function toggle(optionValue: string, checked: boolean) {
    const next = checked ? [...selected, optionValue] : selected.filter((v) => v !== optionValue);
    // Keep the option order stable so the same selection always produces
    // the same URL (and the same query cache key).
    onChange(
      options
        .filter((o) => next.includes(o.value))
        .map((o) => o.value)
        .join(','),
    );
  }

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${label}: ${selected.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // "… filter" keeps the name distinct from a table's sort-header
          // button of the same column (e.g. "Status").
          <Button
            variant="outline"
            aria-label={`${label} filter`}
            className="min-w-40 justify-between font-normal"
          >
            {summary}
            <ChevronDown className="text-muted-foreground size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        {options.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.value}
            checked={selected.includes(opt.value)}
            onCheckedChange={(checked) => toggle(opt.value, !!checked)}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
