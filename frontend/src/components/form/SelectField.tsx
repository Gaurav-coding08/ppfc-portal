import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from './Field';

export interface SelectOption {
  value: string;
  label: string;
}

// The underlying primitive is a custom listbox (not a native <select>), so
// it's controlled value/onChange rather than ref-registered — pair with
// react-hook-form's `<Controller render={({ field }) => <SelectField
// value={field.value} onChange={field.onChange} ... />} />`.
export function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  error,
  required,
  description,
  disabled,
}: {
  label: string;
  name: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  required?: boolean;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} htmlFor={name} error={error} required={required} description={description}>
      <Select value={value} onValueChange={(v) => onChange(v ?? '')} disabled={disabled}>
        <SelectTrigger id={name} className="w-full" aria-invalid={!!error}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
