/**
 * The organisation's formatting facts, as the backend states them on
 * sign-in (GET /api/auth/me/): its currency and its time zone. "Today",
 * "overdue" and every date shown are in this time zone, not the browser's.
 *
 * Held in one module so a formatter can read it without a hook. Until the
 * session check answers, the defaults below apply (the same values the
 * backend ships with).
 */
export interface Currency {
  code: string
  symbol: string
  decimal_places: number
  /** How digits group: 'lakh' (12,34,567), the way people in Pakistan read money, or 'western' (1,234,567). */
  grouping?: 'lakh' | 'western'
}

export interface Organisation {
  currency: Currency
  time_zone: string
  /** The organisation's name and one line of promise (sign-in screen and welcome). */
  name?: string
  promise?: string
}

let current: Organisation = {
  currency: { code: 'PKR', symbol: 'Rs', decimal_places: 2, grouping: 'lakh' },
  time_zone: 'Asia/Karachi',
}

export function setOrganisation(organisation: Organisation | undefined) {
  if (organisation) current = organisation
}

export function organisation(): Organisation {
  return current
}
