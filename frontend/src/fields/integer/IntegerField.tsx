import { DecimalField } from '../decimal/DecimalField'
import type { FieldProps } from '../shared/types'

interface IntegerFieldProps extends FieldProps<number> {
  /** The widest value allowed (from the model's validators), for the typing guard. */
  maxValue?: number
  computed?: { description: string }
}

/**
 * A whole number: right-aligned, tabular figures, thousands separators once
 * typed, no spinner arrows (a text box with a numeric keyboard, not
 * `type=number`). Built on the decimal field at scale 0, so typing, display
 * and states behave identically. Range checks are the server's; it states
 * them as a field error.
 */
export function IntegerField({ value, onChange, maxValue, ...rest }: IntegerFieldProps) {
  const maxDigits = maxValue != null ? Math.max(String(Math.trunc(Math.abs(maxValue))).length, 1) : 15
  return (
    <DecimalField
      {...rest}
      value={value == null ? null : String(value)}
      onChange={(next) => onChange?.(next == null ? null : Number(next))}
      maxDigits={maxDigits}
      decimalPlaces={0}
    />
  )
}
