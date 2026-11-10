import { archiveVerbs } from '@/lib/archiveVerbs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  columnResizingFeature,
  columnSizingFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  CloudOff,
  FileQuestion,
  Filter,
  Inbox,
  Pencil,
  Plus,
  SearchX,
} from 'lucide-react'
import { StatePanel } from '@/components/StatePanel'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { isNumericType, renderListCell } from '@/fields/listRegistry'
import { typeIcon } from '@/fields/typeIcons'
import { ListCell } from '@/fields/shared/ListCell'
import { emitRecordChanged, isRecordHeld, openRecord, RecordRef, useRecordChanged } from '@/records'
import { apiGet, apiSend, ApiError } from '@/lib/api'
import {
  baseParams,
  differsFromView,
  EMPTY_LIST_STATE,
  filterProblem,
  fromViewState,
  parseFilter,
  toViewState,
  type FilterLabels,
  type GroupHeader,
  type ListState,
  type SavedView,
} from '@/lib/listQuery'
import { aggregateDisplay } from '@/fields/aggregateDisplay'
import { useLocation } from '@/lib/router'
import { usePreference } from '@/lib/usePreference'
import { toast } from '@/lib/toast'
import { tokenPx } from '@/lib/tokens'
import { useModelSchema } from '@/lib/useModelSchema'
import { isVisible } from '@/lib/visibility'
import { cn } from '@/lib/utils'
import type { RecordEnvelope } from '@/types/record'
import type { ModelSchema } from '@/types/schema'
import { BulkBar } from './BulkBar'
import { Checkbox } from '@/components/ui/checkbox'
import { FilterBar } from './FilterBar'
import { InlineEditor } from './InlineEditor'
import { ListControls, SearchBox } from './ListControls'
import { DEFAULT_LIST_PREFS, DENSITY_TOKEN, type Density, type ListPrefs } from './listPrefs'
import { isInlineEditable } from './inlineEditable'
import { SummaryStrip } from './SummaryStrip'
import { useAggregate } from './useAggregate'
import { useGroupedWindow } from './useGroupedWindow'
import { useRecordWindow } from './useRecordWindow'
import { ViewMenu } from './ViewMenu'
import './ListRenderer.css'

/**
 * Renders any exposed model's list from its schema. Same law as the form
 * renderer: nothing here may know which model it is showing.
 */
interface ListRendererProps {
  appLabel: string
  model: string
  /**
   * The list's name ("Contacts"), or null once it's gone. The list never sets
   * the window title itself; whatever contains it decides where a label goes.
   *
   * Opening a record is the other thing that leaves this component, and it
   * leaves as an intent (`openRecord`), never as a URL or a navigation: the
   * list doesn't know whether a record opens as a page, a drawer or a tab.
   *
   * Layout: the list fills its container's height and scrolls inside itself,
   * so its container must give it a definite height.
   */
  onLabelChange?: (label: string | null) => void
  /**
   * Fixed exact-match filters (`{parent: 5}`): the list shows only matching
   * records. The API applies them, on fields this user can read only. A
   * related list under a form is this list with its parent as the filter.
   */
  filter?: Record<string, string | number>
  /** Show these columns instead of the schema's (a related list's own choice). */
  columns?: string[]
  /**
   * `page` (default): toolbar, search, filters, views, summaries, groups;
   * fills its container and scrolls. `embedded`: just the table, as tall as
   * its rows, at most `maxRows` of them, for sitting inside something else.
   */
  variant?: 'page' | 'embedded'
  maxRows?: number
  /** The matching total, whenever it's known: a container can show a count. */
  onTotal?: (total: number) => void
  /** Offered beside the filter it clears (a page list opened filtered). */
  onClearFilter?: () => void
  /**
   * What the person chose (filters, sort, grouping, view…), when the
   * container keeps it (a page keeps it in the URL, so a filtered list can be
   * shared and survives a reload). Without it the list keeps its own.
   */
  state?: ListState
  onStateChange?: (state: ListState) => void
}

const features = tableFeatures({ rowSortingFeature, columnSizingFeature, columnResizingFeature })

/** A line in the list: a record (null until its page loads), or a group's header. */
interface Slot {
  record: RecordEnvelope | null
  group?: GroupHeader
}

const SEARCH_DEBOUNCE_MS = 250

/**
 * How wide a column starts, as a share of the default, by field type. A
 * checkbox column doesn't need what an email column does. By type, never by
 * model; the first column (the record's name, by convention) gets extra.
 */
const TYPE_WIDTH: Record<string, number> = {
  boolean: 0.5,
  selection: 0.7,
  integer: 0.65,
  decimal: 0.85,
  // Money carries a symbol and can run to crores: give it room, so a large
  // amount is never clipped (a right-aligned cell would lose its "Rs" first).
  currency: 1.05,
  date: 0.7,
  datetime: 0.9,
  phone: 0.85,
  email: 1.2,
  url: 1.2,
  longtext: 1.4,
}

/**
 * The least a column of this type may be squeezed to. A date or an amount cut with an ellipsis is wrong
 * data ("12 Nov 2…"), not a long name: they keep their whole value (a crore-sized amount included).
 */
const IDENTIFIER_MIN = 132
/** A person's name is read, not skimmed: "Kamran Lashari", not "Kamran L…". */
const PERSON_MIN = 136
const LEAD_MIN = 220
const TYPE_MIN: Record<string, number> = { date: 104, datetime: 148, currency: 136, decimal: 100 }

/**
 * Column widths that use the room they're given. Wider viewport: every column
 * grows in proportion, so there's no dead strip after the last one. Narrower:
 * every column gives up its slack above its minimum, in proportion, so the
 * last column isn't clipped. Only when even the minimums don't fit does the
 * table scroll sideways.
 */
function fitSizes(sizes: number[], mins: number[], available: number): number[] {
  const total = sizes.reduce((a, b) => a + b, 0)
  if (!available || total === 0 || Math.abs(total - available) < 1) return sizes
  if (available > total) return sizes.map((size) => size * (available / total))
  const slack = sizes.map((size, i) => Math.max(0, size - mins[i]))
  const slackTotal = slack.reduce((a, b) => a + b, 0)
  const need = total - available
  if (slackTotal <= need) return sizes.map((size, i) => Math.min(size, mins[i]))
  return sizes.map((size, i) => size - slack[i] * (need / slackTotal))
}

/**
 * The least a column may be squeezed to. Text can be cut with an ellipsis, but a chip is a status: cut
 * "Assessed" to "Assessec" and it reads as a typo. A column of chips never goes narrower than its longest
 * label (a rough 6.6px a letter at 12px, plus the chip's padding and the cell's).
 */
function chipColumnMin(labels: string[], floor: number): number {
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0)
  // Capped: a very long label ("Examination labour") ellipsizes inside its chip, which is by design; it must
  // not take the room the other columns need in a narrow table (a related list is 660px wide).
  return longest === 0 ? floor : Math.max(floor, Math.min(112, Math.ceil(longest * 6.6) + 52))
}
const OVERSCAN_ROWS = 12

export function ListRenderer(props: ListRendererProps) {
  // Retry = remount, so the schema fetch restarts from scratch.
  const [attempt, setAttempt] = useState(0)
  return <ListLoader key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />
}

function ListLoader({
  appLabel,
  model,
  onLabelChange,
  onRetry,
  ...options
}: ListRendererProps & { onRetry: () => void }) {
  const schemaState = useModelSchema(appLabel, model)

  if (schemaState.status === 'error') {
    return (
      <div className="list-page">
        {schemaState.notFound ? (
          // Doesn't exist, or not for this user: the API answers both with 404.
          <StatePanel
            icon={FileQuestion}
            title="This list isn’t available"
            message="It doesn’t exist, or you don’t have access to it."
          />
        ) : (
          <LoadError message={schemaState.message} onRetry={onRetry} />
        )}
      </div>
    )
  }
  if (schemaState.status === 'loading') {
    return (
      <div className="list-page" aria-busy="true">
        <div className="list-toolbar">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-[var(--control-height)] w-64" />
        </div>
      </div>
    )
  }
  return (
    <ListView
      schema={schemaState.schema}
      appLabel={appLabel}
      model={model}
      onLabelChange={onLabelChange}
      {...options}
    />
  )
}

function initialSorting(schema: ModelSchema): SortingState {
  return schema.list.sort
    .filter((sort) => schema.list.columns.includes(sort.field))
    .map((sort) => ({ id: sort.field, desc: sort.direction === 'desc' }))
}

function sortingFrom(ordering: string, schema: ModelSchema): SortingState {
  if (!ordering) return initialSorting(schema)
  return ordering
    .split(',')
    .filter(Boolean)
    .map((part) => ({ id: part.replace(/^-/, ''), desc: part.startsWith('-') }))
    .filter((sort) => sort.id in schema.fields)
}

function ListView({
  schema,
  appLabel,
  model,
  onLabelChange,
  filter,
  columns: columnsOverride,
  variant = 'page',
  maxRows,
  onTotal,
  onClearFilter,
  state: controlled,
  onStateChange,
}: {
  schema: ModelSchema
  appLabel: string
  model: string
  onLabelChange?: (label: string | null) => void
} & Omit<ListRendererProps, 'appLabel' | 'model' | 'onLabelChange'>) {
  const embedded = variant === 'embedded'
  const modelRef = useMemo(() => ({ app_label: appLabel, model }), [appLabel, model])

  // The list's state: the container's (a page keeps it in the URL) or its own.
  const [ownState, setOwnState] = useState<ListState>(EMPTY_LIST_STATE)
  const listState = controlled ?? ownState
  const latest = useRef(listState)
  latest.current = listState
  const setListState = useCallback(
    (next: Partial<ListState>) => {
      const merged = { ...latest.current, ...next }
      latest.current = merged
      if (onStateChange) onStateChange(merged)
      else setOwnState(merged)
    },
    [onStateChange],
  )

  const sorting = useMemo(() => sortingFrom(listState.ordering, schema), [listState.ordering, schema])
  const setSorting = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    setListState({ ordering: next.map((sort) => (sort.desc ? '-' : '') + sort.id).join(',') })
  }

  // This person's choices for this list (row density, hidden columns), kept
  // on the server so they follow them between machines. A view's own columns
  // and density win while it's open.
  const prefs = usePreference<ListPrefs>(`list.${appLabel}.${model}`, DEFAULT_LIST_PREFS)
  const { hidden, extra = [] } = { ...DEFAULT_LIST_PREFS, ...prefs.value }
  const density: Density = listState.density ?? { ...DEFAULT_LIST_PREFS, ...prefs.value }.density
  const prefColumns = useMemo(() => {
    const shown = schema.list.columns.filter((name) => !hidden.includes(name))
    // Fields the person added, after the declared ones, in schema order.
    const added = Object.keys(schema.fields).filter(
      (name) => extra.includes(name) && !schema.list.columns.includes(name),
    )
    const all = [...shown, ...added]
    return all.length > 0 ? all : schema.list.columns
  }, [schema.list.columns, schema.fields, hidden, extra])
  const visibleColumns = useMemo(() => {
    // A container's own column choice wins, narrowed to what this user can read.
    if (columnsOverride) {
      const chosen = columnsOverride.filter((name) => name in schema.fields)
      if (chosen.length > 0) return chosen
    }
    const fromState = listState.columns?.filter((name) => name in schema.fields)
    return fromState && fromState.length > 0 ? fromState : prefColumns
  }, [columnsOverride, listState.columns, schema.fields, prefColumns])

  // Archived records are out of the list unless asked for: one switch in the
  // toolbar, which lists the archived ones instead.
  const archiveField = schema.archive_field ?? null
  const verbs = archiveVerbs(schema)
  const [showArchived, setShowArchived] = useState(false)

  // Filters this user can apply; the rest are shown on their chips, never sent.
  const applicable = useMemo(
    () => (embedded ? [] : listState.filters.filter((raw) => filterProblem(parseFilter(raw), schema) === null)),
    [embedded, listState.filters, schema],
  )
  const unavailable = embedded ? 0 : listState.filters.length - applicable.length
  const groupBy = !embedded && listState.groupBy && schema.list.groupable?.includes(listState.groupBy) ? listState.groupBy : null
  // The column the list is grouped by says, on every row, what the group header above it already says.
  const shownColumns = useMemo(() => {
    const rest = groupBy ? visibleColumns.filter((name) => name !== groupBy) : visibleColumns
    return rest.length > 0 ? rest : visibleColumns
  }, [visibleColumns, groupBy])

  const query = useMemo(() => {
    const exact: Record<string, string> = Object.fromEntries(Object.entries(filter ?? {}).map(([k, v]) => [k, String(v)]))
    if (showArchived && archiveField) exact[archiveField] = 'false'
    return baseParams({ ...listState, filters: applicable }, exact).toString()
  }, [filter, showArchived, archiveField, listState, applicable])

  const searchRef = useRef<HTMLInputElement>(null)
  const [searchInput, setSearchInput] = useState(listState.q)
  const [lastQ, setLastQ] = useState(listState.q)
  if (listState.q !== lastQ) {
    // The state's search changed from outside (a view, the URL): show it.
    setLastQ(listState.q)
    if (listState.q !== searchInput.trim()) setSearchInput(listState.q)
  }
  useEffect(() => {
    const timeout = setTimeout(() => {
      const q = searchInput.trim()
      if (q !== latest.current.q) setListState({ q })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput, setListState])

  useEffect(() => {
    if (embedded) return
    onLabelChange?.(capitalize(schema.verbose_name_plural))
    return () => onLabelChange?.(null)
  }, [schema.verbose_name_plural, onLabelChange, embedded])

  // ---------- Views ----------
  const [views, setViews] = useState<SavedView[] | null>(null)
  const loadViews = useCallback(() => {
    apiGet<{ views: SavedView[] }>(`/views/${appLabel}/${model}/`)
      .then((response) => setViews(response.views))
      .catch(() => setViews([]))
  }, [appLabel, model])
  useEffect(() => {
    if (!embedded) loadViews()
  }, [embedded, loadViews])
  const activeView = views?.find((view) => view.id === listState.view) ?? null
  // A link that names only a view (`?view=module:aging`) opens that view.
  const bareView =
    listState.view !== null && listState.filters.length === 0 && !listState.ordering && !listState.groupBy
  useEffect(() => {
    if (activeView && bareView && differsFromView({ ...listState, q: '' }, activeView.state)) {
      setListState({ ...fromViewState(activeView.state, activeView.id), q: listState.q })
    }
    // Once, when the views arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView?.id])
  const changed = activeView ? differsFromView(listState, activeView.state) : false
  const applyView = (view: SavedView | null) => {
    setSearchInput('')
    setListState(view ? fromViewState(view.state, view.id) : EMPTY_LIST_STATE)
  }
  const saveView = async (label: string, shared: boolean) => {
    const saved = await apiSend<SavedView>('POST', `/views/${appLabel}/${model}/`, {
      label,
      shared,
      state: toViewState(snapshotState()),
    })
    setViews((current) => [...(current ?? []), saved])
    setListState({ view: saved.id, q: '' })
    setSearchInput('')
    toast({ message: `Saved view “${saved.label}”` })
  }
  const updateView = async () => {
    if (!activeView) return
    const saved = await apiSend<SavedView>('PATCH', `/views/${appLabel}/${model}/${activeView.id}/`, {
      state: toViewState(snapshotState()),
    })
    setViews((current) => (current ?? []).map((view) => (view.id === saved.id ? saved : view)))
    toast({ message: `Updated view “${saved.label}”` })
  }
  const deleteView = async (view: SavedView) => {
    await apiSend('DELETE', `/views/${appLabel}/${model}/${view.id}/`)
    setViews((current) => (current ?? []).filter((v) => v.id !== view.id))
    if (listState.view === view.id) setListState({ view: null })
    toast({ message: `Deleted view “${view.label}”` })
  }
  /** What a view saves: the state, with the columns and density on screen made explicit. */
  const snapshotState = (): ListState => ({ ...listState, columns: visibleColumns, density })

  // ---------- Data ----------
  const ordering = sorting.map((sort) => (sort.desc ? '-' : '') + sort.id).join(',')
  const aggregate = useAggregate(appLabel, model, query, groupBy, !embedded)
  const aggregateData =
    aggregate.state.status === 'ready'
      ? aggregate.state
      : aggregate.state.status === 'loading'
        ? aggregate.state.previous
        : null
  const groups = groupBy ? (aggregateData?.groups ?? null) : null
  const grouped = groupBy !== null
  const flat = useRecordWindow(appLabel, model, ordering, query, !grouped)
  const groupedWindow = useGroupedWindow(appLabel, model, ordering, query, groups, listState.collapsed)

  const status: 'loading' | 'error' | 'ready' = grouped
    ? aggregate.state.status === 'error' || groupedWindow.error
      ? 'error'
      : groups
        ? 'ready'
        : 'loading'
    : flat.state.status
  const errorText = grouped
    ? (aggregate.state.status === 'error' ? aggregate.state.message : groupedWindow.error) ?? ''
    : flat.state.status === 'error'
      ? flat.state.message
      : ''
  const total = grouped ? groupedWindow.total : flat.state.status === 'ready' ? flat.state.total : 0
  const recordCount = grouped ? (groups ?? []).reduce((sum, g) => sum + g.count, 0) : total
  const getRow = grouped ? groupedWindow.getRecord : flat.getRow
  const updateRow = grouped ? groupedWindow.updateRow : flat.updateRow
  const replaceRecord = grouped ? groupedWindow.replaceRecord : flat.replaceRecord
  const ensureRange = grouped ? groupedWindow.ensureRange : flat.ensureRange
  const retry = () => {
    flat.retry()
    aggregate.retry()
  }

  useEffect(() => {
    if (status === 'ready') onTotal?.(recordCount)
  }, [status, recordCount, onTotal])

  // A record of this model was saved elsewhere (a peek, say): show it as saved.
  // A record this list doesn't have yet (just created, say a person added
  // under this company) means the list itself changed: fetch it again. Either
  // way, the totals may have moved.
  useRecordChanged((change) => {
    if (change.model.app_label !== appLabel || change.model.model !== model) return
    const known = grouped ? groupedWindow.hasRecord(change.record.id) : flat.hasRecord(change.record.id)
    // Archived or restored: it no longer belongs in this list (or now does).
    const belongs = !archiveField || (change.record.values[archiveField] === false) === showArchived
    if (known && belongs) replaceRecord(change.record)
    else flat.retry()
    aggregate.retry()
  })

  // Re-render when a peek opens or closes, so the open record's row can say so.
  useLocation()

  // Names for linked records in filter chips, as they become known.
  const [filterLabels, setFilterLabels] = useState<FilterLabels>({})
  const addFilterLabels = useCallback((field: string, labels: Record<string, string>) => {
    setFilterLabels((current) => ({ ...current, [field]: { ...current[field], ...labels } }))
  }, [])

  // Keyboard: one tab stop for the whole list, arrows inside it. `activeIndex`
  // is the row that tab stop sits on.
  const [activeIndex, setActiveIndex] = useState(0)
  // One cell at a time can be in the editor; one cell at a time shows "saved".
  const [editing, setEditing] = useState<{ index: number; field: string } | null>(null)
  // Ticked rows, for the actions the schema offers this user (none: no tick boxes at all).
  const selectable = !embedded && (schema.list.bulk_actions?.length ?? 0) > 0
  const [selected, setSelected] = useState<number[]>([])
  const stateKey = JSON.stringify([listState.filters, listState.q, listState.view, showArchived])
  useEffect(() => setSelected([]), [stateKey])
  const shownIds = useMemo(() => {
    if (grouped) return [] as number[]
    const ids: number[] = []
    for (let index = 0; index < total; index++) {
      const record = getRow(index)
      if (record) ids.push(record.id)
    }
    return ids
  }, [grouped, total, getRow, flat.state])
  const toggleSelected = (id: number) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  const [savedCell, setSavedCell] = useState<{ index: number; field: string } | null>(null)
  useEffect(() => {
    if (!savedCell) return
    const timeout = setTimeout(() => setSavedCell(null), 1400)
    return () => clearTimeout(timeout)
  }, [savedCell])

  const data = useMemo<Slot[]>(
    () =>
      Array.from({ length: total }, (_, index) => {
        if (!grouped) return { record: getRow(index) }
        const item = groupedWindow.itemAt(index)
        return item?.kind === 'group' ? { record: null, group: item.group } : { record: item?.record ?? null }
      }),
    [total, getRow, grouped, groupedWindow],
  )

  const rowHeight = useMemo(() => tokenPx(DENSITY_TOKEN[density], 34), [density])
  const columns = useMemo<ColumnDef<typeof features, Slot>[]>(() => {
    const defaultWidth = tokenPx('--column-default-width', 180)
    const minWidth = tokenPx('--column-min-width', 80)
    return shownColumns.map((name, columnIndex) => {
      const field = schema.fields[name]
      const share = (TYPE_WIDTH[field.type] ?? 1) * (columnIndex === 0 ? 1.9 : 1)
      const stateLabels = schema.workflow?.field === name ? schema.workflow.states.map((state) => state.label) : []
      const choiceLabels = field.type === 'selection' ? (field.choices ?? []).map((choice) => choice.label) : []
      // A document number (JOB-2026-0001, BILL-2026-00001) is read whole: a mono identifier never wraps or is cut.
      const identifierMin = field.assigned ? IDENTIFIER_MIN : 0
      // The first column is what a row is about (a client, a consumer): it is read whole before anything beside it.
      const leadMin = columnIndex === 0 && !field.assigned && !TYPE_MIN[field.type] ? LEAD_MIN : 0
      const columnMin = chipColumnMin([...stateLabels, ...choiceLabels], Math.max(minWidth, TYPE_MIN[field.type] ?? 0, identifierMin, leadMin, field.person ? PERSON_MIN : 0))
      return {
        id: name,
        header: field.label,
        accessorFn: (slot: Slot) => slot.record?.values[name],
        size: Math.max(columnMin, Math.round(defaultWidth * share)),
        minSize: columnMin,
        // TanStack guesses the first direction from the first row's value,
        // which here may be an unloaded slot or an empty field. A first
        // click always means ascending.
        sortDescFirst: false,
        cell: ({ row }) => {
          const record = row.original.record
          if (!record) return <Skeleton className="h-3 w-3/5" />
          // Hidden means not applicable: a field that doesn't apply to this
          // row shows as empty, whatever value is stored behind it.
          if (!isVisible(field, record.values)) return <ListCell empty />
          // A workflow state reads as a chip, in its schema tone.
          const state = schema.workflow?.field === name
            ? schema.workflow.states.find((s) => s.value === record.values[name])
            : undefined
          if (state) {
            return (
              <ListCell>
                <StatusChip label={state.label} tone={state.tone} />
              </ListCell>
            )
          }
          // A document number is a record identifier: Plex Mono, like the header's.
          if (field.assigned) {
            const value = record.values[name]
            return value ? <ListCell className="list-cell--identifier" title={String(value)}>{String(value)}</ListCell> : <ListCell empty />
          }
          return renderListCell({
            schema: field,
            value: record.values[name],
            label: record.labels[name] ?? null,
            restricted: record.restricted?.[name] === true,
          })
        },
      }
    })
  }, [schema, shownColumns])

  const table = useTable({
    features,
    columns,
    data,
    getRowId: (_slot, index) => String(index),
    state: { sorting },
    onSortingChange: setSorting,
    // The server sorts; TanStack only holds the sort state and the header
    // interactions. Sorting a loaded window client-side would be wrong the
    // moment a second page arrives.
    manualSorting: true,
    enableMultiSort: false,
    // A list is always in some order. Clicking cycles asc ↔ desc, never
    // "unsorted" — which would silently fall back to a different order.
    enableSortingRemoval: false,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: embedded && maxRows != null ? Math.min(total, maxRows) : total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN_ROWS,
  })

  // The room the table has, and whether the person has taken over sizing.
  const [viewportWidth, setViewportWidth] = useState(0)
  const [userSized, setUserSized] = useState(false)
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // A new density is a new row height: re-measure.
  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  const virtualRows = virtualizer.getVirtualItems()
  const firstIndex = virtualRows[0]?.index ?? 0
  const lastIndex = virtualRows[virtualRows.length - 1]?.index ?? 0
  useEffect(() => {
    if (total > 0) ensureRange(firstIndex, lastIndex)
  }, [firstIndex, lastIndex, total, ensureRange])

  // A new sort, search, filter or grouping is a new list — back to the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [ordering, query, groupBy])

  const rows = table.getRowModel().rows
  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const minColumnWidth = useMemo(() => tokenPx('--column-min-width', 80), [])
  const widths = userSized
    ? headers.map((header) => header.getSize())
    : fitSizes(
        headers.map((header) => header.getSize()),
        headers.map((header) => header.column.columnDef.minSize ?? minColumnWidth),
        viewportWidth,
      )
  const totalWidth = widths.reduce((a, b) => a + b, 0)
  const widthOf = (columnId: string) => widths[headers.findIndex((h) => h.column.id === columnId)]
  // Taking over the sizing freezes what the person is looking at first, so the
  // first drag starts from the width on screen, not from the unfitted default.
  const freezeSizing = () => {
    if (userSized) return
    table.setColumnSizing(Object.fromEntries(headers.map((h, i) => [h.column.id, widths[i]])))
    setUserSized(true)
  }
  const plural = schema.verbose_name_plural

  const openRow = (index: number, event: React.MouseEvent | React.KeyboardEvent) => {
    const record = getRow(index)
    if (!record) return
    // Links inside a cell (email, url) keep doing their own thing.
    if ((event.target as HTMLElement).closest('a')) return
    // A row opens a peek: you keep your place in the list. The row's own
    // "open as page" action, and modifier-click, are the other ways in.
    openRecord(
      modelRef,
      record.id,
      { surface: 'peek', newBrowserTab: 'metaKey' in event && (event.metaKey || event.ctrlKey) },
    )
  }

  /** Save one cell. The row changes at once; if the server says no, it changes back. */
  const commitCell = async (index: number, fieldName: string, value: string | number | null) => {
    setEditing(null)
    const before = getRow(index)
    if (!before) return
    if ((before.values[fieldName] ?? null) === value) return
    const field = schema.fields[fieldName]
    updateRow(index, { ...before, values: { ...before.values, [fieldName]: value } })
    setSavedCell({ index, field: fieldName })
    try {
      const saved = await apiSend<RecordEnvelope>('PATCH', `/data/${appLabel}/${model}/${before.id}/`, {
        [fieldName]: value,
      })
      updateRow(index, saved)
      emitRecordChanged(modelRef, saved)
      toast({
        message: `${field.label} updated`,
        action: {
          label: 'Undo',
          onClick: () => {
            // Put the old value back by the record's id: the row may have moved.
            apiSend<RecordEnvelope>('PATCH', `/data/${appLabel}/${model}/${before.id}/`, {
              [fieldName]: before.values[fieldName] ?? null,
            })
              .then((restored) => {
                replaceRecord(restored)
                emitRecordChanged(modelRef, restored)
              })
              .catch(() => toast({ kind: 'error', message: `Couldn’t undo that. Reload and try again.` }))
          },
        },
      })
    } catch (error) {
      updateRow(index, before)
      setSavedCell(null)
      const detail =
        error instanceof ApiError ? (error.validation?.[fieldName]?.[0] ?? error.message) : 'Something went wrong.'
      toast({ kind: 'error', message: `Couldn’t save ${field.label.toLowerCase()}. ${detail}` })
    }
  }

  const focusRow = (index: number) => {
    const last = Math.max(0, total - 1)
    const next = Math.min(last, Math.max(0, index))
    setActiveIndex(next)
    virtualizer.scrollToIndex(next)
    // The row may not be mounted until the scroll lands; focus it once it is,
    // trying a second time if the first look found nothing.
    const focusWhenMounted = (attemptsLeft: number) => {
      const row = scrollRef.current?.querySelector<HTMLElement>(`[data-row-index="${next}"]`)
      if (row) row.focus()
      else if (attemptsLeft > 0) setTimeout(() => focusWhenMounted(attemptsLeft - 1), 50)
    }
    setTimeout(() => focusWhenMounted(2), 0)
  }

  const toggleGroup = (key: string) =>
    setListState({
      collapsed: listState.collapsed.includes(key)
        ? listState.collapsed.filter((k) => k !== key)
        : [...listState.collapsed, key],
    })

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    // Keys typed into an inline editor never reach here (it stops them).
    if (event.target !== event.currentTarget) return
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight) - 1)
    const group = data[index]?.group
    switch (event.key) {
      case 'Enter':
        if (group) toggleGroup(group.key)
        else openRow(index, event)
        break
      case 'ArrowDown':
        event.preventDefault()
        focusRow(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRow(index - 1)
        break
      case 'PageDown':
        event.preventDefault()
        focusRow(index + page)
        break
      case 'PageUp':
        event.preventDefault()
        focusRow(index - page)
        break
      case 'Home':
        event.preventDefault()
        focusRow(0)
        break
      case 'End':
        event.preventDefault()
        focusRow(total - 1)
        break
      case 'F2': {
        // Edit the first cell in the row that can be edited.
        const first = visibleColumns.find((name) => isInlineEditable(schema.fields[name]))
        if (first && !group) {
          event.preventDefault()
          setEditing({ index, field: first })
        }
        break
      }
    }
  }

  const shownRows = embedded && maxRows != null ? Math.min(total, maxRows) : total
  const filtered = applicable.length > 0
  const dropped = (activeView?.dropped ?? 0) + unavailable
  const groupable = (schema.list.groupable ?? []).map((id) => ({ id, label: schema.fields[id].label }))
  const summaries = aggregateData?.summaries ?? null

  const changeColumns = (next: { hidden: string[]; extra: string[] }) => {
    if (listState.view) {
      // Inside a view, columns are the view's: changing them edits it.
      const shown = schema.list.columns.filter((name) => !next.hidden.includes(name))
      const added = Object.keys(schema.fields).filter((name) => next.extra.includes(name) && !schema.list.columns.includes(name))
      setListState({ columns: [...shown, ...added] })
    } else {
      prefs.set({ density, ...next })
    }
  }
  const columnState = listState.columns
    ? {
        hidden: schema.list.columns.filter((name) => !visibleColumns.includes(name)),
        extra: visibleColumns.filter((name) => !schema.list.columns.includes(name)),
      }
    : { hidden, extra }

  return (
    <div
      className={cn('list-page', embedded && 'list-page--embedded')}
      style={
        // The default row height is --row-height itself; the others replace it.
        density === 'default' || embedded ? undefined : { ['--row-height' as string]: `var(${DENSITY_TOKEN[density]})` }
      }
    >
      {!embedded && (
      <div className="list-toolbar">
        <h1 className="list-toolbar__title">
          {showArchived ? (
            `${verbs.archived} ${plural}`
          ) : (
            <ViewMenu
              plural={plural}
              views={views}
              activeId={listState.view}
              changed={changed}
              onApply={applyView}
              onSave={saveView}
              onUpdate={updateView}
              onDelete={deleteView}
            />
          )}
          {status === 'ready' && (
            <span className="list-toolbar__count">{recordCount.toLocaleString()}</span>
          )}
        </h1>
        <div className="list-toolbar__actions">
          <SearchBox
            value={searchInput}
            onChange={setSearchInput}
            placeholder={`Search ${plural}…`}
            inputRef={searchRef}
          />
          <ListControls
            density={density}
            onDensity={(next) => (listState.view ? setListState({ density: next }) : prefs.set({ density: next, hidden, extra }))}
            // Every field this user can read, declared columns first. Long
            // text and the record id don't make useful columns.
            columns={[
              ...schema.list.columns,
              ...Object.keys(schema.fields).filter(
                (id) =>
                  !schema.list.columns.includes(id) &&
                  schema.fields[id].type !== 'longtext' &&
                  id !== 'id',
              ),
            ].map((id) => ({ id, label: schema.fields[id].label }))}
            hidden={[
              ...columnState.hidden,
              ...Object.keys(schema.fields).filter(
                (id) => !schema.list.columns.includes(id) && !columnState.extra.includes(id),
              ),
            ]}
            onToggleColumn={(id) => {
              const { hidden: h, extra: e } = columnState
              if (schema.list.columns.includes(id)) {
                changeColumns({ extra: e, hidden: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] })
              } else {
                changeColumns({ hidden: h, extra: e.includes(id) ? e.filter((x) => x !== id) : [...e, id] })
              }
            }}
            onResetColumns={() => (listState.view ? setListState({ columns: null }) : prefs.set({ density, hidden: [], extra: [] }))}
            customised={columnState.hidden.length > 0 || columnState.extra.length > 0}
            onRefresh={retry}
            refreshing={status === 'loading'}
            groupable={groupable}
            groupBy={groupBy}
            onGroupBy={(field) => setListState({ groupBy: field, collapsed: [] })}
          />
          {archiveField && (
            <Button
              type="button"
              variant="outline"
              aria-pressed={showArchived}
              onClick={() => setShowArchived((on) => !on)}
              className={cn('h-[var(--control-height)]', showArchived && 'list-toolbar__toggle--on')}
            >
              <Archive className="size-4" aria-hidden />
              {verbs.archived}
            </Button>
          )}
          {schema.actions.create && !showArchived && (
            <Button asChild className="h-[var(--control-height)]">
              <RecordRef model={modelRef} id="new">
                <Plus className="size-4" aria-hidden />
                New {schema.verbose_name}
              </RecordRef>
            </Button>
          )}
        </div>
      </div>

      )}

      {!embedded && (
        <div className="list-filterline">
          {filter && Object.keys(filter).length > 0 && (
            <div className="list-filters" role="status">
              {Object.entries(filter).map(([name, value]) => {
                const field = schema.fields[name]
                const first = getRow(0)
                // A link's name, from the rows themselves; otherwise the value.
                const shown = (field?.type === 'many_to_one' && first?.labels[name]) || String(value)
                return (
                  <span key={name} className="list-filters__chip">
                    <span className="list-filters__label">{field?.label ?? name}</span> is <strong>{shown}</strong>
                  </span>
                )
              })}
              {onClearFilter && (
                <button type="button" className="list-filters__clear" onClick={onClearFilter}>
                  Show all
                </button>
              )}
            </div>
          )}
          <FilterBar
            schema={schema}
            filters={listState.filters}
            labels={filterLabels}
            onLabels={addFilterLabels}
            onChange={(filters) => setListState({ filters })}
          />
          {dropped > 0 && (
            <p className="list-filterline__note" role="status">
              {dropped === 1 ? '1 filter isn’t available to you' : `${dropped} parts of this view aren’t available to you`}
            </p>
          )}
        </div>
      )}

      {selectable && selected.length > 0 && (
        <BulkBar
          appLabel={appLabel}
          model={model}
          schema={schema}
          selected={selected}
          onClear={() => setSelected([])}
          onDone={retry}
        />
      )}

      {!embedded && (
        <SummaryStrip
          summaries={summaries}
          loading={aggregate.state.status === 'loading'}
          slots={schema.list.summaries?.length ?? 0}
          onApply={(summary) =>
            setListState({ filters: [...listState.filters, ...summary.filter.filter((f) => !listState.filters.includes(f))] })
          }
        />
      )}

      <div
        ref={scrollRef}
        className="list-scroll"
        // Embedded: exactly as tall as its header and rows, no inner scroll.
        style={
          embedded
            ? { height: `calc(var(--table-header-height) + ${Math.max(shownRows, 1)} * var(--row-height) + 2px)`, flex: 'none' }
            : undefined
        }
      >
        <div className="list-table" role="table" aria-rowcount={total} style={{ width: totalWidth }}>
          <div className="list-header" role="row">
            {headers.map((header) => {
              const field = schema.fields[header.column.id]
              const sorted = header.column.getIsSorted()
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={cn(
                    'list-header__cell',
                    isNumericType(field.type) && 'list-header__cell--numeric',
                  )}
                  style={{ width: widths[headers.indexOf(header)] }}
                >
                  {selectable && !grouped && header.column.id === shownColumns[0] && (
                    <span className="list-header__select">
                      <Checkbox
                        aria-label={`Select every ${schema.verbose_name} shown`}
                        checked={shownIds.length > 0 && shownIds.every((id) => selected.includes(id))}
                        onCheckedChange={(checked) => setSelected(checked ? shownIds : [])}
                      />
                    </span>
                  )}
                  <button
                    type="button"
                    className="list-header__sort"
                    onClick={header.column.getToggleSortingHandler()}
                    title={field.label}
                  >
                    {(() => {
                      const Icon = typeIcon(field.type)
                      return <Icon className="list-header__icon" aria-hidden />
                    })()}
                    <span className="list-header__label">{field.label}</span>
                    {sorted === 'asc' && <ArrowUp className="list-header__arrow" aria-hidden />}
                    {sorted === 'desc' && <ArrowDown className="list-header__arrow" aria-hidden />}
                  </button>
                  <div
                    className={cn(
                      'list-header__resizer',
                      header.column.getIsResizing() && 'list-header__resizer--active',
                    )}
                    onPointerEnter={freezeSizing}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onDoubleClick={() => header.column.resetSize()}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${field.label}`}
                  />
                </div>
              )
            })}
          </div>

          {status === 'loading' && (grouped ? <SkeletonGroups columns={widths} /> : <SkeletonRows columns={widths} />)}

          {status === 'error' && (
            <StatePanel icon={CloudOff} tone="danger" title={`Couldn’t load ${plural}`} message={errorText}>
              <Button variant="outline" onClick={retry} className="h-[var(--control-height)]">
                Try again
              </Button>
            </StatePanel>
          )}

          {embedded && status === 'ready' && total === 0 && (
            <p className="list-embedded-empty">None yet.</p>
          )}

          {!embedded && status === 'ready' && total === 0 && (
            listState.q ? (
              <StatePanel
                icon={SearchX}
                title={`No ${showArchived ? 'archived ' : ''}${plural} match “${listState.q}”`}
                message={`Search looks in ${schema.list.search_fields.map((f) => schema.fields[f]?.label ?? f).join(', ')}.`}
              >
                <Button variant="outline" onClick={() => setSearchInput('')} className="h-[var(--control-height)]">
                  Clear search
                </Button>
              </StatePanel>
            ) : filtered ? (
              <StatePanel
                icon={Filter}
                title="No records match these filters"
                message="Remove a filter, or clear them all to see every record."
              >
                <Button variant="outline" onClick={() => setListState({ filters: [] })} className="h-[var(--control-height)]">
                  Clear filters
                </Button>
              </StatePanel>
            ) : showArchived ? (
              <StatePanel
                icon={Archive}
                title={`No archived ${plural}`}
                message={`Archiving a ${schema.verbose_name} takes it out of the list without deleting it. Archived ones show up here.`}
              >
                <Button variant="outline" onClick={() => setShowArchived(false)} className="h-[var(--control-height)]">
                  Back to {plural}
                </Button>
              </StatePanel>
            ) : (
              <StatePanel
                icon={Inbox}
                title={`No ${plural} yet`}
                message={
                  schema.actions.create
                    ? `Add the first ${schema.verbose_name} and it will show up here.`
                    : `When someone adds a ${schema.verbose_name}, it will show up here.`
                }
              >
                {schema.actions.create && (
                  <Button asChild className="h-[var(--control-height)]">
                    <RecordRef model={modelRef} id="new">
                      <Plus className="size-4" aria-hidden />
                      New {schema.verbose_name}
                    </RecordRef>
                  </Button>
                )}
              </StatePanel>
            )
          )}

          {status === 'ready' && total > 0 && (
            <div className="list-body" style={{ height: virtualizer.getTotalSize() }}>
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index]
                if (!row) return null
                const group = row.original.group
                if (group) {
                  return (
                    <GroupRow
                      key={virtualRow.key}
                      group={group}
                      index={virtualRow.index}
                      start={virtualRow.start}
                      collapsed={listState.collapsed.includes(group.key)}
                      onToggle={() => toggleGroup(group.key)}
                      columns={shownColumns.map((name) => ({ name, width: widthOf(name), type: schema.fields[name].type }))}
                      tabIndex={virtualRow.index === activeIndex ? 0 : -1}
                      onFocus={() => setActiveIndex(virtualRow.index)}
                      onKeyDown={(event) => onRowKeyDown(event, virtualRow.index)}
                    />
                  )
                }
                const record = row.original.record
                const loaded = record != null
                const open = loaded && isRecordHeld(modelRef, record.id)
                return (
                  <div
                    key={virtualRow.key}
                    role="row"
                    aria-rowindex={virtualRow.index + 1}
                    aria-selected={open || undefined}
                    data-row-index={virtualRow.index}
                    tabIndex={loaded && virtualRow.index === activeIndex ? 0 : -1}
                    className={cn(
                      'list-row',
                      !loaded && 'list-row--pending',
                      open && 'list-row--open',
                      editing?.index === virtualRow.index && 'list-row--editing',
                    )}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onClick={(event) => openRow(virtualRow.index, event)}
                    onFocus={(event) => event.target === event.currentTarget && setActiveIndex(virtualRow.index)}
                    onKeyDown={(event) => onRowKeyDown(event, virtualRow.index)}
                  >
                    {row.getAllCells().map((cell) => {
                      const name = cell.column.id
                      const field = schema.fields[name]
                      const editable =
                        loaded &&
                        schema.actions.update &&
                        isInlineEditable(field) &&
                        isVisible(field, record.values)
                      const isEditing = editing?.index === virtualRow.index && editing.field === name
                      const justSaved = savedCell?.index === virtualRow.index && savedCell.field === name
                      return (
                        <div
                          key={cell.id}
                          role="cell"
                          className={cn(
                            'list-row__cell',
                            isNumericType(field.type) && 'list-row__cell--numeric',
                            isEditing && 'list-row__cell--editing',
                            justSaved && 'list-row__cell--saved',
                          )}
                          style={{ width: widthOf(name) }}
                          // Anything pressed inside the editor belongs to the editor, not the row.
                          onClick={isEditing ? (event) => event.stopPropagation() : undefined}
                        >
                          {isEditing && loaded ? (
                            <InlineEditor
                              field={field}
                              value={record.values[name]}
                              onCommit={(value) => void commitCell(virtualRow.index, name, value)}
                              onCancel={() => {
                                setEditing(null)
                                scrollRef.current
                                  ?.querySelector<HTMLElement>(`[data-row-index="${virtualRow.index}"]`)
                                  ?.focus()
                              }}
                            />
                          ) : (
                            <>
                              {selectable && loaded && name === shownColumns[0] && (
                                <span className="list-row__select" onClick={(event) => event.stopPropagation()}>
                                  <Checkbox
                                    aria-label={`Select ${record.display}`}
                                    checked={selected.includes(record.id)}
                                    onCheckedChange={() => toggleSelected(record.id)}
                                  />
                                </span>
                              )}
                              {/* Keyed by value, so a changed value cross-fades in. */}
                              <div
                                key={JSON.stringify(record?.values[name] ?? null)}
                                className="list-row__value"
                              >
                                <table.FlexRender cell={cell} />
                              </div>
                              {justSaved && <Check className="list-row__saved" aria-label="Saved" />}
                              {editable && !justSaved && (
                                <button
                                  type="button"
                                  className="list-row__edit"
                                  aria-label={`Edit ${field.label}`}
                                  title={`Edit ${field.label.toLowerCase()} (F2 edits the first)`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setEditing({ index: virtualRow.index, field: name })
                                  }}
                                >
                                  <Pencil aria-hidden />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                    {loaded && (
                      <div className="list-row__actions">
                        <RecordRef
                          model={modelRef}
                          id={record.id}
                          surface="page"
                          className="list-row__action"
                          aria-label={`Open ${record.display} as a page`}
                          title="Open as page"
                          tabIndex={-1}
                        >
                          <ArrowUpRight aria-hidden />
                        </RecordRef>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A group's header row: its name, how many records, and the sum of every
 * money column under that column. The label spans the columns before the
 * first sum, so a long name isn't squeezed into one narrow cell.
 */
export function GroupRow({
  group,
  index,
  start,
  collapsed,
  onToggle,
  columns,
  tabIndex,
  onFocus,
  onKeyDown,
  loading,
}: {
  group: GroupHeader
  index: number
  start: number
  collapsed: boolean
  onToggle: () => void
  columns: { name: string; width: number; type: string }[]
  tabIndex?: number
  onFocus?: () => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void
  /** Gallery: the header before its counts arrive. */
  loading?: boolean
}) {
  const firstSum = columns.findIndex((column) => column.type === 'currency' && column.name in group.sums)
  const lead = firstSum === -1 ? columns.length : Math.max(1, firstSum)
  const leadWidth = columns.slice(0, lead).reduce((sum, column) => sum + column.width, 0)
  const openable = group.filter !== null
  return (
    <div
      role="row"
      aria-rowindex={index + 1}
      aria-expanded={openable ? !collapsed : undefined}
      data-row-index={index}
      tabIndex={tabIndex}
      className={cn('list-group', collapsed && 'list-group--collapsed', !openable && 'list-group--closed', group.muted && 'list-group--muted')}
      style={{ transform: `translateY(${start}px)` }}
      onClick={openable ? onToggle : undefined}
      onFocus={(event) => event.target === event.currentTarget && onFocus?.()}
      onKeyDown={onKeyDown}
      title={openable ? undefined : 'These records fall outside every range, so they can’t be listed as one group.'}
    >
      <div role="cell" className="list-group__lead" style={{ width: leadWidth }}>
        <ChevronRight className={cn('list-group__chevron', !openable && 'invisible')} aria-hidden />
        <span className={cn('list-group__label', group.restricted && 'restricted-value')}>
          {group.restricted ? 'Restricted' : group.label}
        </span>
        {loading ? (
          <Skeleton className="h-3 w-8" />
        ) : (
          <span className="list-group__count">{group.count.toLocaleString()}</span>
        )}
      </div>
      {columns.slice(lead).map((column) => (
        <div key={column.name} role="cell" className="list-group__cell" style={{ width: column.width }}>
          {column.type === 'currency' && column.name in group.sums && !group.muted && (
            loading ? <Skeleton className="ml-auto h-3 w-16" /> : <span className="list-group__sum" title={aggregateDisplay('currency', group.sums[column.name]).exact}>{aggregateDisplay('currency', group.sums[column.name]).short}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function SkeletonRows({ columns }: { columns: number[] }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: 12 }, (_, row) => (
        <div key={row} className="list-row list-row--static list-row--pending">
          {columns.map((width, column) => (
            <div key={column} className="list-row__cell" style={{ width }}>
              <Skeleton className="h-3 w-3/5" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Group headers on their way: header-shaped, with a few rows under each. */
function SkeletonGroups({ columns }: { columns: number[] }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: 3 }, (_, group) => (
        <div key={group}>
          <div className="list-group list-group--static">
            <div className="list-group__lead" style={{ width: columns[0] }}>
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          {Array.from({ length: 3 }, (_, row) => (
            <div key={row} className="list-row list-row--static list-row--pending">
              {columns.map((width, column) => (
                <div key={column} className="list-row__cell" style={{ width }}>
                  <Skeleton className="h-3 w-3/5" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StatePanel icon={CloudOff} tone="danger" title="Couldn’t load this list" message={message}>
      <Button variant="outline" onClick={onRetry} className="h-[var(--control-height)]">
        Try again
      </Button>
    </StatePanel>
  )
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
