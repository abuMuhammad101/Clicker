import { formatDecimal } from '@/lib/money'

/**
 * Decimals are strings end to end ("1245000.50"), exactly as the API sends
 * them: never a JavaScript number, which can't hold every value exactly.
 *
 * Thousands-separated, padded to the field's declared scale. Used for the
 * blurred/readonly/list-cell display — never while the user is actively
 * typing, which shows the raw string instead (see DecimalField).
 */
export function formatDecimalDisplay(value: string | null, decimalPlaces: number): string {
  if (value == null || value === '') return ''
  return formatDecimal(value, decimalPlaces)
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

/** The raw string → the committed decimal string, or null for "not a number yet". */
export function parseDecimalInput(raw: string): string | null {
  if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return null
  const trimmed = raw.endsWith('.') ? raw.slice(0, -1) : raw
  return trimmed.startsWith('.') ? `0${trimmed}` : trimmed.replace(/^-\./, '-0.')
}

/** The unformatted editing representation of a committed value. */
export function toRawDecimalString(value: string | null): string {
  return value ?? ''
}

/** "1,234.50" → ["1,234", ".50"], so a cell can let the decimals recede. */
export function splitDecimalDisplay(display: string): [string, string] {
  const dot = display.lastIndexOf('.')
  return dot === -1 ? [display, ''] : [display.slice(0, dot), display.slice(dot)]
}
