import { organisation } from './organisation'

/**
 * Dates as Clicker stores and shows them.
 *
 * - Stored and sent as ISO "2026-10-30". A date has no time and no zone, so
 *   it's handled as a plain string, never a JavaScript Date in local time
 *   (which would shift a day for someone west of UTC).
 * - Shown as "30 Oct 2026": day, short month, year. Unambiguous in every
 *   locale, unlike 10/30/2026 or 30/10/2026.
 * - Typed day-first, the way Pakistan writes dates: 30/10/2026, 30-10-26,
 *   30.10.2026, "30 oct", "today".
 * - "Today" is today in the organisation's time zone.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  MONTHS.map((month, index) => [month.toLowerCase(), index + 1]),
)

export interface DateParts {
  year: number
  month: number // 1-12
  day: number
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

export function toISO({ year, month, day }: DateParts): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

export function fromISO(iso: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return null
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  return isRealDate(parts) ? parts : null
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isRealDate({ year, month, day }: DateParts) {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** Today in the organisation's time zone, as ISO. */
export function todayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: organisation().time_zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Whole-day arithmetic on ISO dates, done in UTC so no zone can shift it. */
export function addDays(iso: string, days: number): string {
  const p = fromISO(iso)!
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return toISO({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() })
}

export function addMonths(iso: string, months: number): string {
  const p = fromISO(iso)!
  const index = p.year * 12 + (p.month - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return toISO({ year, month, day: Math.min(p.day, daysInMonth(year, month)) })
}

export function startOfMonth(iso: string): string {
  const p = fromISO(iso)!
  return toISO({ ...p, day: 1 })
}

export function endOfMonth(iso: string): string {
  const p = fromISO(iso)!
  return toISO({ ...p, day: daysInMonth(p.year, p.month) })
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayMondayFirst(iso: string): number {
  const p = fromISO(iso)!
  return (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7
}

/** "30 Oct 2026". */
export function formatDate(iso: string | null | undefined): string {
  const p = iso ? fromISO(iso) : null
  if (!p) return ''
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`
}

export function monthName(month: number) {
  return MONTHS[month - 1]
}

/**
 * What a person typed, as ISO, or null if it isn't a real date.
 * Day first, always: "03/04/2026" is 3 April.
 */
export function parseDateText(text: string, today: string = todayISO()): string | null {
  const input = text.trim().toLowerCase()
  if (!input) return null
  if (input === 'today' || input === 'tod') return today
  if (input === 'yesterday') return addDays(today, -1)
  if (input === 'tomorrow') return addDays(today, 1)

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input)
  if (iso) return build(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const year = fromISO(today)!.year
  // 30/10/2026, 30-10-26, 30.10.2026, 30 10 2026, 30/10
  const numeric = /^(\d{1,2})[/.\-\s](\d{1,2})(?:[/.\-\s](\d{2}|\d{4}))?$/.exec(input)
  if (numeric) return build(expandYear(numeric[3], year), Number(numeric[2]), Number(numeric[1]))

  // 30 oct 2026, 30 october, 30-oct-26
  const named = /^(\d{1,2})[\s.\-/]*([a-z]{3,})[\s.\-/,]*(\d{2}|\d{4})?$/.exec(input)
  if (named) {
    const month = MONTH_INDEX[named[2].slice(0, 3)]
    if (!month) return null
    return build(expandYear(named[3], year), month, Number(named[1]))
  }
  return null
}

function expandYear(text: string | undefined, current: number) {
  if (!text) return current
  const n = Number(text)
  return text.length === 2 ? 2000 + n : n
}

function build(year: number, month: number, day: number) {
  const parts = { year, month, day }
  return isRealDate(parts) ? toISO(parts) : null
}

/** "30 Oct 2026, 14:05" for an ISO date-time, in the organisation's zone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const instant = new Date(iso)
  if (Number.isNaN(instant.getTime())) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: organisation().time_zone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "2 hours ago", "yesterday", "just now". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormatter.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
