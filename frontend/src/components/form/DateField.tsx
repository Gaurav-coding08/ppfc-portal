import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from './Field';

interface DateFieldProps extends Omit<React.ComponentPropsWithoutRef<typeof Input>, 'type'> {
  label: string;
  error?: string;
  description?: string;
}

// A native `<input type="date">` — it already produces/accepts the
// YYYY-MM-DD string the API expects, with no Date object and no timezone
// parsing involved (CLAUDE.md's date-handling rule applies to *display*,
// which is what lib/format.ts covers; this is plain form input).
export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(
  ({ label, error, description, required, id, name, ...props }, ref) => {
    const fieldId = id ?? name;
    return (
      <Field label={label} htmlFor={fieldId!} error={error} required={required} description={description}>
        <Input id={fieldId} name={name} type="date" ref={ref} aria-invalid={!!error} {...props} />
      </Field>
    );
  },
);
DateField.displayName = 'DateField';
