import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Field } from './Field';

interface TextFieldProps extends React.ComponentPropsWithoutRef<typeof Input> {
  label: string;
  error?: string;
  description?: string;
}

// Spreads react-hook-form's `register('fieldName')` directly: {name, onChange,
// onBlur, ref}. `forwardRef` is required for that ref to reach the <input>.
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, description, required, id, name, ...props }, ref) => {
    const fieldId = id ?? name;
    return (
      <Field label={label} htmlFor={fieldId!} error={error} required={required} description={description}>
        <Input id={fieldId} name={name} ref={ref} aria-invalid={!!error} {...props} />
      </Field>
    );
  },
);
TextField.displayName = 'TextField';
