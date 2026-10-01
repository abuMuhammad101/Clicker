import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps } from '../shared/types'
import {
  formatDecimalDisplay,
  isValidDecimalInput,
  parseDecimalInput,
  toRawDecimalString,
} from './decimalFormat'

interface DecimalFieldProps extends FieldProps<number> {
  /** Total significant digits (Django's max_digits) — the typing guard rejects anything beyond it. */
  maxDigits: number
  /** Digits after the point (Django's decimal_places) — governs both the typing guard and display padding. */
  decimalPlaces: number
}

export function DecimalField({
  name,
  label,
  value,
  onChange,
  maxDigits,
  decimalPlaces,
  required,
  disabled,
  readOnly,
  loading,
  error,
  helpText,
  placeholder,
  dirty,
  forceFocused,
}: DecimalFieldProps) {
  const [focused, setFocused] = useState(false)
  // The raw, unformatted buffer the user is actively typing into — kept
  // separate from `value` so an in-progress "12." or "-" isn't clobbered
  // by the formatted/committed representation on every keystroke.
  const [raw, setRaw] = useState(() => toRawDecimalString(value))

  // The value can change out from under the input (a different record
  // loads) — resync the buffer, but only while not focused, so a reload
  // mid-edit doesn't overwrite what's actually being typed.
  useEffect(() => {
    if (!focused) setRaw(toRawDecimalString(value))
  }, [value, focused])

  if (loading) {
    return (
      <FieldShell label={label} required={required}>
        <Skeleton className="h-[var(--control-height)] w-full" />
      </FieldShell>
    )
  }

  const isNegative = value != null && value < 0
  const showRaw = focused || forceFocused

  return (
    <FieldShell
      label={label}
      htmlFor={name}
      required={required}
      error={error}
      helpText={helpText}
      readOnly={readOnly}
      dirty={dirty}
      readOnlyValue={
        value != null ? (
          <span className={cn('tabular-nums', isNegative && 'text-[color:var(--danger)]')}>
            {formatDecimalDisplay(value, decimalPlaces)}
          </span>
        ) : undefined
      }
    >
      <Input
        id={name}
        inputMode="decimal"
        value={showRaw ? raw : formatDecimalDisplay(value, decimalPlaces)}
        onChange={(event) => {
          const candidate = event.target.value
          // Reject outright rather than accept-then-strip: an invalid
          // keystroke just doesn't land, same as a native number input.
          if (!isValidDecimalInput(candidate, maxDigits, decimalPlaces)) return
          setRaw(candidate)
          onChange?.(parseDecimalInput(candidate))
        }}
        onFocus={() => {
          setFocused(true)
          setRaw(toRawDecimalString(value))
        }}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={!!error}
        className={cn(
          'text-right tabular-nums',
          isNegative && !showRaw && 'text-[color:var(--danger)]',
          forceFocused && FORCE_FOCUS_CLASSES,
        )}
      />
    </FieldShell>
  )
}
