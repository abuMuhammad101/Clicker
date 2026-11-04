import { formatDate } from '@/lib/dates'
import { aggregateDisplay } from '@/fields/aggregateDisplay'
import { formatMoney, groupThousands } from '@/lib/money'
import type { FieldSchema, FieldType, ModelSchema } from '@/types/schema'

/**
 * The list query, in the API's grammar (backend `data/query.py`): a filter is
 * `field:op:value`, and the list's whole state (filters, sort, grouping,
 * collapsed groups, columns, density, the active view) is plain data that a
 * container can keep in the URL and a saved view can store. Nothing here
 * knows a model; operators come from the field's type.
 */

export type Operator =
  | 'contains'
  | 'is'
  | 'empty'
  | 'in'
  | 'on'
  | 'before'
  | 'after'
  | 'between'
  | 'older_than'
  | 'preset'
  | 'eq'
  | 'gte'
  | 'lte'

export interface FilterItem {
  field: string
  op: Operator
  values: string[]
}

const TEXT: FieldType[] = ['text', 'longtext', 'email', 'phone', 'url']
const NUMBER: FieldType[] = ['integer', 'decimal', 'currency']

export function operatorsFor(type: FieldType): Operator[] {
  if (TEXT.includes(type)) return ['contains', 'is', 'empty']
  if (NUMBER.includes(type)) return ['eq', 'gte', 'lte', 'between', 'empty']
  if (type === 'selection') return ['in']
  if (type === 'boolean') return ['is']
  if (type === 'date') return ['on', 'before', 'after', 'between', 'older_than', 'preset', 'empty']
  if (type === 'many_to_one') return ['in', 'empty']
  return []
}

export function isFilterable(field: FieldSchema) {
  return operatorsFor(field.type).length > 0
}

export const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
] as const

/** `state:in:posted,draft` → its parts, or null if it isn't one. Values split on commas except free text. */
export function parseFilter(raw: string): FilterItem | null {
  const first = raw.indexOf(':')
  if (first <= 0) return null
  const second = raw.indexOf(':', first + 1)
  const field = raw.slice(0, first)
  const op = (second === -1 ? raw.slice(first + 1) : raw.slice(first + 1, second)) as Operator
  const value = second === -1 ? '' : raw.slice(second + 1)
  if (!op) return null
  if (op === 'empty') return { field, op, values: [] }
  const free = op === 'contains' || (op === 'is' && value !== 'true' && value !== 'false')
  return { field, op, values: free ? [value] : value.split(',').filter(Boolean) }
}

export function formatFilter(item: FilterItem): string {
  return item.values.length ? `${item.field}:${item.op}:${item.values.join(',')}` : `${item.field}:${item.op}`
}

/** Why a filter can't be applied for this user, or null if it can. */
export function filterProblem(item: FilterItem | null, schema: ModelSchema): string | null {
  if (!item) return 'This filter isn’t readable.'
  const field = schema.fields[item.field]
  if (!field) return 'This filter isn’t available to you.'
  if (!operatorsFor(field.type).includes(item.op)) return `${field.label} can’t be filtered this way.`
  if (item.op !== 'empty' && item.values.length === 0) return `${field.label} needs a value.`
  if (item.op === 'between' && item.values.length !== 2) return `${field.label} needs two values.`
  return null
}

/** Labels for many_to_one ids, as far as they're known ({field: {id: label}}). */
export type FilterLabels = Record<string, Record<string, string>>

/** A filter as the sentence its chip reads: "Amount at least Rs 1 lakh". */
export function describeFilter(item: FilterItem, field: FieldSchema | undefined, labels: FilterLabels = {}) {
  if (!field) return { subject: item.field, predicate: 'isn’t available' }
  const subject = field.label
  const v = (value: string) => describeValue(field, value, labels[item.field])
  const list = (values: string[]) =>
    values.length === 1 ? v(values[0]) : values.length === 2 ? `${v(values[0])} or ${v(values[1])}` : `any of ${values.length}`
  switch (item.op) {
    case 'empty':
      return { subject, predicate: 'is empty' }
    case 'contains':
      return { subject, predicate: `contains “${item.values[0]}”` }
    case 'is':
      if (field.type === 'boolean') return { subject, predicate: `is ${item.values[0] === 'true' ? 'yes' : 'no'}` }
      return { subject, predicate: `is “${item.values[0]}”` }
    case 'in':
      return { subject, predicate: `is ${list(item.values)}` }
    case 'eq':
    case 'on':
      return { subject, predicate: `${item.op === 'on' ? 'on' : 'is'} ${v(item.values[0])}` }
    case 'gte':
      return { subject, predicate: `at least ${v(item.values[0])}` }
    case 'lte':
      return { subject, predicate: `at most ${v(item.values[0])}` }
    case 'before':
      return { subject, predicate: `before ${v(item.values[0])}` }
    case 'after':
      return { subject, predicate: `after ${v(item.values[0])}` }
    case 'between':
      return { subject, predicate: `${v(item.values[0])} – ${v(item.values[1])}` }
    case 'older_than':
      return { subject, predicate: `more than ${item.values[0]} days ago` }
    case 'preset':
      return { subject, predicate: (DATE_PRESETS.find((p) => p.value === item.values[0])?.label ?? item.values[0]).toLowerCase() }
  }
}

function describeValue(field: FieldSchema, value: string, labels?: Record<string, string>) {
  if (value === undefined) return '…'
  switch (field.type) {
    case 'currency':
      // A threshold is something a person typed, not a total: from a lakh up it reads
      // like an aggregate (the registry's rule); below it the paisa matter (“Rs 0.01”, not “Rs 0”).
      return Math.abs(Number(value)) >= 100_000 ? aggregateDisplay('currency', value).short : formatMoney(value)
    case 'integer':
    case 'decimal': {
      const negative = value.startsWith('-')
      const [whole, fraction] = value.replace(/^-/, '').split('.')
      return `${negative ? '−' : ''}${groupThousands(whole)}${fraction ? `.${fraction}` : ''}`
    }
    case 'date':
      return formatDate(value)
    case 'selection':
      return field.choices?.find((c) => String(c.value) === value)?.label ?? value
    case 'many_to_one':
      return labels?.[value] ?? '…'
    default:
      return value
  }
}

/** Everything a list shows that a person chose: what a view saves and a URL carries. */
export interface ListState {
  filters: string[]
  /** `-amount,name`; empty means the schema's own sort. */
  ordering: string
  groupBy: string | null
  /** Keys of collapsed groups. */
  collapsed: string[]
  /** Null: the person's own column choice (their list preference). */
  columns: string[] | null
  density: 'compact' | 'default' | 'comfortable' | null
  q: string
  /** The saved view this state started from (`module:aging`, `12`), if any. */
  view: string | null
}

export const EMPTY_LIST_STATE: ListState = {
  filters: [],
  ordering: '',
  groupBy: null,
  collapsed: [],
  columns: null,
  density: null,
  q: '',
  view: null,
}

/** The query keys a list state owns in a URL; anything else is someone else's. */
export const LIST_STATE_KEYS = ['filter', 'sort', 'group', 'collapsed', 'view', 'q'] as const

export function listStateFromSearch(params: URLSearchParams): ListState {
  return {
    ...EMPTY_LIST_STATE,
    filters: params.getAll('filter'),
    ordering: params.get('sort') ?? '',
    groupBy: params.get('group') || null,
    collapsed: (params.get('collapsed') ?? '').split(',').filter(Boolean),
    q: params.get('q') ?? '',
    view: params.get('view') || null,
  }
}

export function listStateToSearch(state: ListState, into = new URLSearchParams()) {
  for (const key of LIST_STATE_KEYS) into.delete(key)
  if (state.view) into.set('view', state.view)
  for (const filter of state.filters) into.append('filter', filter)
  if (state.ordering) into.set('sort', state.ordering)
  if (state.groupBy) into.set('group', state.groupBy)
  if (state.groupBy && state.collapsed.length) into.set('collapsed', state.collapsed.join(','))
  if (state.q) into.set('q', state.q)
  return into
}

/** The parts of a state a saved view stores, as the API takes them. */
export interface ViewState {
  filters: string[]
  ordering: string
  group_by: string | null
  collapsed: string[]
  columns: string[] | null
  density: ListState['density']
}

export function toViewState(state: ListState): ViewState {
  return {
    filters: state.filters,
    ordering: state.ordering,
    group_by: state.groupBy,
    collapsed: state.groupBy ? state.collapsed : [],
    columns: state.columns,
    density: state.density,
  }
}

export function fromViewState(view: ViewState, id: string): ListState {
  return {
    filters: view.filters ?? [],
    ordering: view.ordering ?? '',
    groupBy: view.group_by ?? null,
    collapsed: view.collapsed ?? [],
    columns: view.columns ?? null,
    density: view.density ?? null,
    q: '',
    view: id,
  }
}

/** Has the state moved away from the view it started from? */
export function differsFromView(state: ListState, view: ViewState) {
  const a = toViewState(state)
  const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null)
  return (
    !same([...a.filters].sort(), [...(view.filters ?? [])].sort()) ||
    !same(a.ordering, view.ordering ?? '') ||
    !same(a.group_by, view.group_by ?? null) ||
    !same([...a.collapsed].sort(), [...(view.collapsed ?? [])].sort()) ||
    (a.columns !== null && !same(a.columns, view.columns ?? null)) ||
    (a.density !== null && !same(a.density, view.density ?? null)) ||
    state.q !== ''
  )
}

export interface SavedView {
  id: string
  label: string
  kind: 'module' | 'personal' | 'shared'
  owner: string | null
  shared: boolean
  editable: boolean
  state: ViewState
  /** How many of its parts were left out because this user can't read them. */
  dropped: number
}

export interface Summary {
  key: string
  label: string
  aggregate: 'sum' | 'count' | 'avg'
  type: FieldType
  value: string
  filter: string[]
}

export interface GroupHeader {
  key: string
  label: string | null
  count: number
  sums: Record<string, string>
  /** The filter that selects this group's rows; null when no one condition can. */
  filter: string | null
  restricted?: boolean
  empty?: boolean
  /** A stage nothing is in: shown, quietly, so the pipeline reads whole. */
  muted?: boolean
}

/** The query-string part every list request for one state shares (not sort, not paging). */
export function baseParams(state: ListState, exact: Record<string, string>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(exact)) params.set(key, value)
  for (const filter of state.filters) params.append('filter', filter)
  if (state.q) params.set('q', state.q)
  return params
}
