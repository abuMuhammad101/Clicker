import type { RecordTarget } from '@/records'

/**
 * The peek stack lives in the URL, as repeated `peek` params, oldest first:
 *
 *   /core/contact?peek=core.country.3&peek=core.contact.12
 *
 * URL state is what makes a peek behave like part of the app and not a
 * floating widget: the browser's back button closes it, a reload reopens it,
 * a link to it can be shared, and — because closing it is a navigation —
 * every unsaved-changes guard applies to it with no extra code.
 */
export const MAX_PEEK_DEPTH = 3
const PARAM = 'peek'
const ENCODED = /^([a-z_]+)\.([a-z_]+)\.(\d+|new)$/

export function encodeTarget(target: RecordTarget) {
  return `${target.app_label}.${target.model}.${target.id}`
}

function decodeTarget(text: string): RecordTarget | null {
  const match = ENCODED.exec(text)
  if (!match) return null
  return { app_label: match[1], model: match[2], id: match[3] === 'new' ? 'new' : Number(match[3]) }
}

export function readPeekStack(search: string): RecordTarget[] {
  return new URLSearchParams(search)
    .getAll(PARAM)
    .map(decodeTarget)
    .filter((target): target is RecordTarget => target != null)
    .slice(0, MAX_PEEK_DEPTH)
}

/** The same URL with a different peek stack; every other param is kept. */
export function peekUrl(pathname: string, search: string, stack: RecordTarget[]) {
  const params = new URLSearchParams(search)
  params.delete(PARAM)
  for (const target of stack) params.append(PARAM, encodeTarget(target))
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
