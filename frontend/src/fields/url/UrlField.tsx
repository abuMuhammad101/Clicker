import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps } from '../shared/types'

export function UrlField({
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
          <a href={value} target="_blank" rel="noreferrer" className="truncate hover:underline">
            {value}
          </a>
        ) : undefined
      }
    >
      <Input
        id={name}
        type="url"
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
