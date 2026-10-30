import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { decimalParts } from '@/lib/money'
import { cn } from '@/lib/utils'
import { FieldShell } from '../shared/FieldShell'
import { FORCE_FOCUS_CLASSES, type FieldProps } from '../shared/types'
import { formatDecimalDisplay, isValidDecimalInput, parseDecimalInput, toRawDecimalString } from './decimalFormat'

export interface DecimalFieldProps extends FieldProps<string> {
  /** Total significant digits (Django's max_digits) — the typing guard rejects anything beyond it. */
  maxDigits: number
  /** Digits after the point (Django's decimal_places) — governs both the typing guard and display padding. */
  decimalPlaces: number
  /** A currency symbol shown before the amount ("Rs"): set by CurrencyField. */
  symbol?: string
  /** The "calculated" mark, for computed fields. */
  computed?: { description: string }
}

/**
 * A decimal, typed and shown as a string. Right-aligned with tabular figures
 * so columns of amounts line up; the decimals recede (muted) once the value
 * is committed; a negative carries a minus sign and nothing else (never red:
 * red belongs to status).
 */
export function DecimalField({
  name,
  label,
  value,
  onChange,
  maxDigits,
  decimalPlaces,
  symbol,
  computed,
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
      <FieldShell label={label} required={required} computed={computed}>
        <Skeleton className="h-[var(--control-height)] w-full" />
      </FieldShell>
    )
  }

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
      computed={computed}
      readOnlyValue={value != null && value !== '' ? <Amount value={value} places={decimalPlaces} symbol={symbol} /> : undefined}
    >
      <div className={cn('amount-input', symbol && 'amount-input--symbol')}>
        {symbol && (
          <span className="amount-input__symbol" aria-hidden="true">
            {symbol}
          </span>
        )}
        <Input
          id={name}
          inputMode="decimal"
          value={showRaw ? raw : formatDecimalDisplay(value, decimalPlaces)}
          onChange={(event) => {
            const candidate = event.target.value.replace(/,/g, '')
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
          placeholder={placeholder ?? (0).toFixed(decimalPlaces)}
          aria-invalid={!!error}
          aria-label={symbol ? `${label}, in ${symbol}` : undefined}
          className={cn('text-right tabular-nums', forceFocused && FORCE_FOCUS_CLASSES)}
        />
      </div>
    </FieldShell>
  )
}

/** A committed amount: symbol, whole units, receding decimals. */
export function Amount({ value, places, symbol }: { value: string; places: number; symbol?: string }) {
  const { sign, whole, fraction } = decimalParts(value, places)
  return (
    <span className="amount">
      {sign}
      {symbol && <span className="amount__symbol">{symbol} </span>}
      {whole}
      {fraction && <span className="amount__fraction">{fraction}</span>}
    </span>
  )
}
