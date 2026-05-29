import { FieldWrapper } from '@DCRM/ui/components/formedible/fields/field-wrapper';
import { resolveFieldOptions } from '@DCRM/ui/components/formedible/fields/advanced-field-utils';
import { Field, FieldLabel } from '@DCRM/ui/components/field';
import { RadioGroup, RadioGroupItem } from '@DCRM/ui/components/radio-group';
import type { FormedibleFieldRenderProps, FormedibleFormValues } from '@DCRM/ui/components/formedible/lib/types';

export function RadioField<TFormValues extends FormedibleFormValues>({ fieldConfig, field }: FormedibleFieldRenderProps<TFormValues>) {
  const value = typeof field.value === 'string' ? field.value : '';
  const options = resolveFieldOptions(fieldConfig, field.formValues);

  return (
    <FieldWrapper fieldConfig={fieldConfig} field={field}>
      <RadioGroup
        id={field.id}
        name={field.name}
        value={value}
        disabled={fieldConfig.disabled}
        required={fieldConfig.required}
        aria-invalid={field.error ? true : undefined}
        className={fieldConfig.inputClassName}
        onBlur={field.onBlur}
        onValueChange={field.onChange}
      >
        {options.map((option) => {
          const optionId = `${field.id}-${option.value}`;

          return (
            <Field key={option.value} className="flex flex-row items-center gap-2">
              <RadioGroupItem id={optionId} value={option.value} disabled={option.disabled} />
              <FieldLabel htmlFor={optionId}>{option.label}</FieldLabel>
            </Field>
          );
        })}
      </RadioGroup>
    </FieldWrapper>
  );
}
