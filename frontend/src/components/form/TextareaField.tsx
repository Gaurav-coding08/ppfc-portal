import { forwardRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Field } from './Field';

interface TextareaFieldProps extends React.ComponentPropsWithoutRef<typeof Textarea> {
  label: string;
  error?: string;
  description?: string;
}

export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  ({ label, error, description, required, id, name, ...props }, ref) => {
    const fieldId = id ?? name;
    return (
      <Field label={label} htmlFor={fieldId!} error={error} required={required} description={description}>
        <Textarea id={fieldId} name={name} ref={ref} aria-invalid={!!error} {...props} />
      </Field>
    );
  },
);
TextareaField.displayName = 'TextareaField';
