import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps } from '../shared/types'

export function LongtextField({
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
        <Skeleton className="h-16 w-full" />
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
        value ? <span className="whitespace-pre-wrap">{value}</span> : undefined
      }
    >
      <Textarea
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
