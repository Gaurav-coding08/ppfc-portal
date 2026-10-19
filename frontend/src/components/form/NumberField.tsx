import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from './Field';

interface NumberFieldProps extends Omit<React.ComponentPropsWithoutRef<typeof Input>, 'type'> {
  label: string;
  error?: string;
  description?: string;
}

// Used with react-hook-form's `register('fieldName', { valueAsNumber: true })`
// so the form value is a number, not the raw input string.
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(
  ({ label, error, description, required, id, name, ...props }, ref) => {
    const fieldId = id ?? name;
    return (
      <Field label={label} htmlFor={fieldId!} error={error} required={required} description={description}>
        <Input id={fieldId} name={name} type="number" ref={ref} aria-invalid={!!error} {...props} />
      </Field>
    );
  },
);
NumberField.displayName = 'NumberField';
