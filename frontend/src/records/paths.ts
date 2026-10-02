/**
 * The one place that knows what a record's address looks like. Everything
 * else — the shell's routes, the page surface, RecordRef's href — asks here,
 * so a renderer never builds a URL.
 *
 *   /<app>/<model>           a model's list
 *   /<app>/<model>/<id>      a record
 *   /<app>/<model>/new       a record that doesn't exist yet
 */

/** Same shape as a schema field's `target`, so a many_to_one can pass it straight through. */
export interface ModelRef {
  app_label: string
  model: string
}

export type RecordId = number | 'new'

export interface RecordTarget extends ModelRef {
  id: RecordId
}

const LIST_ROUTE = /^\/([a-z_]+)\/([a-z_]+)\/?$/
const RECORD_ROUTE = /^\/([a-z_]+)\/([a-z_]+)\/(\d+|new)\/?$/

export function listPath(model: ModelRef) {
  return `/${model.app_label}/${model.model}`
}

export function recordPath(target: RecordTarget) {
  return `${listPath(target)}/${target.id}`
}

export function parseRecordPath(pathname: string): RecordTarget | null {
  const match = RECORD_ROUTE.exec(pathname)
  if (!match) return null
  const [, app_label, model, id] = match
  return { app_label, model, id: id === 'new' ? 'new' : Number(id) }
}

export function parseListPath(pathname: string): ModelRef | null {
  const match = LIST_ROUTE.exec(pathname)
  return match ? { app_label: match[1], model: match[2] } : null
}

export function sameTarget(a: RecordTarget, b: RecordTarget) {
  return a.app_label === b.app_label && a.model === b.model && a.id === b.id
}
