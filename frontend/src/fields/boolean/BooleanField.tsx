import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps } from '../shared/types'

export function BooleanField({
  name,
  label,
  value,
  onChange,
  disabled,
  readOnly,
  loading,
  error,
  helpText,
  dirty,
  forceFocused,
}: FieldProps<boolean>) {
  if (loading) {
    return (
      <FieldShell label={label}>
        <Skeleton className="size-4" />
      </FieldShell>
    )
  }

  // A checkbox is never "empty" — it's always true or false — so unlike
  // every other type, boolean has no required-and-empty state to show and
  // FieldShell never receives `required` here.
  return (
    <FieldShell
      label={label}
      htmlFor={name}
      error={error}
      helpText={helpText}
      readOnly={readOnly}
      dirty={dirty}
      readOnlyValue={value ? 'Yes' : 'No'}
    >
      <div className="flex h-[var(--control-height)] items-center">
        <Checkbox
          id={name}
          checked={value ?? false}
          onCheckedChange={(checked) => onChange?.(checked === true)}
          disabled={disabled}
          aria-invalid={!!error}
          className={cn(forceFocused && FORCE_FOCUS_CLASSES)}
        />
      </div>
    </FieldShell>
  )
}
