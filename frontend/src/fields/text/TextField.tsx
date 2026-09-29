import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps } from '../shared/types'

export function TextField({
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
      readOnlyValue={value || undefined}
    >
      <Input
        id={name}
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
