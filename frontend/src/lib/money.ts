import { organisation } from './organisation'

/**
 * Money and other decimals, formatted from the decimal *string* the API
 * sends ("1245000.50"). Never through a JavaScript number: a float can't hold
 * every paisa exactly, and money that changes by a rounding error on its way
 * to the screen is a bug an auditor finds. All arithmetic here is on digits
 * and BigInt.
 */

export interface DecimalParts {
  /** '−' (a true minus sign) or ''. Never colour: red belongs to status. */
  sign: string
  /** Whole units with thousands separators: "1,245,000". */
  whole: string
  /** The point and the fraction, padded to scale: ".50". '' at scale 0. */
  fraction: string
}

const MINUS = '−'

/** "1245000.5" at 2 places → { sign: '', whole: '1,245,000', fraction: '.50' }. */
export function decimalParts(value: string, places: number): DecimalParts {
  const text = value.trim()
  const negative = text.startsWith('-')
  const [intPart = '0', fracPart = ''] = text.replace(/^[-+]/, '').split('.')
  const digits = intPart.replace(/^0+(?=\d)/, '') || '0'
  const fraction = places > 0 ? '.' + (fracPart + '0'.repeat(places)).slice(0, places) : ''
  const isZero = /^0*$/.test(digits) && /^\.?0*$/.test(fraction)
  return { sign: negative && !isZero ? MINUS : '', whole: groupThousands(digits), fraction }
}

export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** "1,245,000.50" (or "−1,245,000.50"). */
export function formatDecimal(value: string, places: number): string {
  const { sign, whole, fraction } = decimalParts(value, places)
  return `${sign}${whole}${fraction}`
}

/** "Rs 1,245,000.00"; a negative amount is "−Rs 1,245,000.00". */
export function formatMoney(value: string): string {
  const { currency } = organisation()
  const { sign, whole, fraction } = decimalParts(value, currency.decimal_places)
  return `${sign}${currency.symbol} ${whole}${fraction}`
}

const LAKH = 100_000n
const CRORE = 10_000_000n

/**
 * For summaries, in the units people in Pakistan count money in:
 * "Rs 6,870 crore", "Rs 12.4 lakh", "Rs 45,300". One decimal under 100 of a
 * unit, none from 100 up; whole rupees below a lakh. Rounded half away from
 * zero, on integers.
 */
export function formatMoneyCompact(value: string): string {
  const { currency } = organisation()
  const { sign } = decimalParts(value, 0)
  const [intPart = '0', fracPart = ''] = value.trim().replace(/^[-+]/, '').split('.')
  // Work in hundredths of a unit (paisa): exact for any input.
  const paisa = BigInt((intPart || '0') + (fracPart + '00').slice(0, 2))

  const scaled = (unit: bigint, decimals: 0 | 1) => {
    const divisor = (unit * 100n) / (decimals === 1 ? 10n : 1n)
    const rounded = (paisa + divisor / 2n) / divisor
    if (decimals === 0) return groupThousands(rounded.toString())
    const whole = rounded / 10n
    const tenth = rounded % 10n
    return tenth === 0n ? groupThousands(whole.toString()) : `${groupThousands(whole.toString())}.${tenth}`
  }

  const rupees = paisa / 100n
  if (rupees >= CRORE) {
    return `${sign}${currency.symbol} ${scaled(CRORE, rupees >= 100n * CRORE ? 0 : 1)} crore`
  }
  if (rupees >= LAKH) {
    return `${sign}${currency.symbol} ${scaled(LAKH, 1)} lakh`
  }
  return `${sign}${currency.symbol} ${scaled(1n, 0)}`
}

/**
 * What a person typed into a money or decimal box, as the API's decimal
 * string: "Rs 1,245,000.5" → "1245000.5"; "" → null. Anything else that
 * isn't a number is null too (the field shows its own error).
 */
export function parseDecimalText(text: string): string | null {
  const cleaned = text.replace(/[\s,]/g, '').replace(/^rs\.?/i, '').replace(/[−–]/g, '-')
  if (cleaned === '') return null
  return /^-?\d+(\.\d*)?$|^-?\.\d+$/.test(cleaned) ? cleaned.replace(/\.$/, '') : null
}
