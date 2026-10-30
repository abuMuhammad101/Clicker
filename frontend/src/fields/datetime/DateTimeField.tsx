import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/dates'
import { FieldShell } from '../shared/FieldShell'
import type { FieldProps } from '../shared/types'

/**
 * A date and time, display-only for now (audit and system times): "30 Oct
 * 2026, 14:05" in the organisation's time zone. Never an input: nothing in
 * Clicker asks a person to type a time yet.
 */
export function DateTimeField({ name, label, value, loading, helpText, dirty, computed }: FieldProps<string> & { computed?: { description: string } }) {
  if (loading) {
    return (
      <FieldShell label={label} computed={computed}>
        <Skeleton className="h-[var(--control-height)] w-full" />
      </FieldShell>
    )
  }
  return (
    <FieldShell
      label={label}
      htmlFor={name}
      helpText={helpText}
      readOnly
      dirty={dirty}
      computed={computed}
      readOnlyValue={value ? <time dateTime={value} className="tabular-nums">{formatDateTime(value)}</time> : undefined}
    >
      {null}
    </FieldShell>
  )
}
