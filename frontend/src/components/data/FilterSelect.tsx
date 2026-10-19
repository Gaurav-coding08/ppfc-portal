import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SelectOption } from '@/components/form/SelectField';

// Sentinel for the "no filter" choice: the listbox needs a non-empty value
// for every item, but the URL represents "no filter" as an absent param.
// It is translated back to '' before reaching `onChange`, so it never
// leaves this component.
const ALL = '__all__';

// A compact select for a FilterBar (no label row — the "All …" option text
// and the aria-label say what it filters). Form fields use SelectField.
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  allLabel: string;
}) {
  const items = [{ value: ALL, label: allLabel }, ...options];
  return (
    <Select
      items={items}
      value={value || ALL}
      onValueChange={(v) => onChange(v === ALL || v === null ? '' : (v as string))}
    >
      <SelectTrigger aria-label={label} className="min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
