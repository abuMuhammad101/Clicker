import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps } from '../shared/types'

// Full format-as-you-type masking (locale-aware digit grouping) is cut for
// this pass — real masking is a meaningfully sized feature on its own, and
// a half-built one is worse than a plain, correctly-typed tel input.
// Tracked as a follow-up, not silently dropped.
export function PhoneField({
  name,
  label,
  value,
  onChange,
  required,
  disabled,
  readOnly,
  loading,
  error,
  helpText,
  placeholder,
  forceFocused,
}: FieldProps<string>) {
  if (loading) {
    return (
      <FieldShell label={label} required={required}>
        <Skeleton className="h-[var(--control-height)] w-full" />
      </FieldShell>
    )
  }

  return (
    <FieldShell
      label={label}
      htmlFor={name}
      required={required}
      error={error}
      helpText={helpText}
      readOnly={readOnly}
      readOnlyValue={
        value ? (
          <a href={`tel:${value}`} className="hover:underline">
            {value}
          </a>
        ) : undefined
      }
    >
      <Input
        id={name}
        type="tel"
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value || null)}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={cn(forceFocused && FORCE_FOCUS_CLASSES)}
      />
    </FieldShell>
  )
}
