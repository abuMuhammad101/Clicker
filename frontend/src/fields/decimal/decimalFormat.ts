/**
 * Thousands-separated, padded to the field's declared scale. Used for the
 * blurred/readonly/list-cell display — never while the user is actively
 * typing, which shows the raw string instead (see DecimalField).
 */
export function formatDecimalDisplay(value: number | null, decimalPlaces: number): string {
  if (value == null) return ''
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  })
}

/**
 * Whether `raw` is an acceptable in-progress decimal string at this
 * field's precision (max_digits) and scale (decimal_places) — including
 * states a user legitimately passes through while typing ("", "-", "12.")
 * that aren't a complete number yet. Used to reject a keystroke outright
 * rather than accept it and strip it later.
 */
export function isValidDecimalInput(raw: string, maxDigits: number, decimalPlaces: number): boolean {
  if (raw === '' || raw === '-') return true

  const pattern = decimalPlaces > 0 ? /^-?\d*\.?\d*$/ : /^-?\d*$/
  if (!pattern.test(raw)) return false

  const [intPart = '', fracPart = ''] = raw.replace('-', '').split('.')
  if (fracPart.length > decimalPlaces) return false
  if (intPart.length + fracPart.length > maxDigits) return false
  return true
}

/** The raw string → the committed number, or null for "not a number yet". */
export function parseDecimalInput(raw: string): number | null {
  if (raw === '') return null
  const parsed = Number(raw)
  return Number.isNaN(parsed) ? null : parsed
}

/** The unformatted editing representation of a committed value. */
export function toRawDecimalString(value: number | null): string {
  return value == null ? '' : String(value)
}
