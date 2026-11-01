import { useEffect, useMemo, useRef, useState } from 'react'
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
  CloudOff,
  FileQuestion,
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
import { apiSend, ApiError } from '@/lib/api'
import { useLocation } from '@/lib/router'
import { usePreference } from '@/lib/usePreference'
import { toast } from '@/lib/toast'
import { tokenPx } from '@/lib/tokens'
import { useModelSchema } from '@/lib/useModelSchema'
import { isVisible } from '@/lib/visibility'
import { cn } from '@/lib/utils'
import type { RecordEnvelope } from '@/types/record'
import type { ModelSchema } from '@/types/schema'
import { InlineEditor } from './InlineEditor'
import { ListControls, SearchBox } from './ListControls'
import { DEFAULT_LIST_PREFS, DENSITY_TOKEN, type ListPrefs } from './listPrefs'
import { isInlineEditable } from './inlineEditable'
import { useRecordWindow } from './useRecordWindow'
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
   * `page` (default): toolbar, search, controls, fills its container and
   * scrolls. `embedded`: just the table, as tall as its rows, at most
   * `maxRows` of them, for sitting inside something else (a form section).
   */
  variant?: 'page' | 'embedded'
  maxRows?: number
  /** The matching total, whenever it's known: a container can show a count. */
  onTotal?: (total: number) => void
  /** Offered beside the filter it clears (a page list opened filtered). */
  onClearFilter?: () => void
}

const features = tableFeatures({ rowSortingFeature, columnSizingFeature, columnResizingFeature })

/** A slot in the list: the record once its page has loaded, null until then. */
interface Slot {
  record: RecordEnvelope | null
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
}: {
  schema: ModelSchema
  appLabel: string
  model: string
  onLabelChange?: (label: string | null) => void
} & Pick<ListRendererProps, 'filter' | 'columns' | 'variant' | 'maxRows' | 'onTotal' | 'onClearFilter'>) {
  const embedded = variant === 'embedded'
  const [sorting, setSorting] = useState<SortingState>(() => initialSorting(schema))

  // This person's choices for this list (row density, hidden columns), kept
  // on the server so they follow them between machines.
  const prefs = usePreference<ListPrefs>(`list.${appLabel}.${model}`, DEFAULT_LIST_PREFS)
  const { density, hidden, extra = [] } = { ...DEFAULT_LIST_PREFS, ...prefs.value }
  const visibleColumns = useMemo(() => {
    // A container's own column choice wins, narrowed to what this user can read.
    if (columnsOverride) {
      const chosen = columnsOverride.filter((name) => name in schema.fields)
      if (chosen.length > 0) return chosen
    }
    const shown = schema.list.columns.filter((name) => !hidden.includes(name))
    // Fields the person added, after the declared ones, in schema order.
    const added = Object.keys(schema.fields).filter(
      (name) => extra.includes(name) && !schema.list.columns.includes(name),
    )
    const all = [...shown, ...added]
    return all.length > 0 ? all : schema.list.columns
  }, [schema.list.columns, schema.fields, hidden, extra, columnsOverride])
  // Archived records are out of the list unless asked for: one switch in the
  // toolbar, which lists the archived ones instead.
  const archiveField = schema.archive_field ?? null
  const [showArchived, setShowArchived] = useState(false)
  const filterKey = useMemo(() => {
    const effective: Record<string, string | number> = { ...filter }
    if (showArchived && archiveField) effective[archiveField] = 'false'
    return Object.keys(effective).length > 0
      ? JSON.stringify(Object.fromEntries(Object.entries(effective).map(([k, v]) => [k, String(v)])))
      : ''
  }, [filter, showArchived, archiveField])
  const searchRef = useRef<HTMLInputElement>(null)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    if (embedded) return
    onLabelChange?.(capitalize(schema.verbose_name_plural))
    return () => onLabelChange?.(null)
  }, [schema.verbose_name_plural, onLabelChange, embedded])

  const ordering = sorting.map((sort) => (sort.desc ? '-' : '') + sort.id).join(',')
  const { state, getRow, ensureRange, updateRow, replaceRecord, retry } = useRecordWindow(
    appLabel,
    model,
    ordering,
    query,
    filterKey,
  )

  useEffect(() => {
    if (state.status === 'ready') onTotal?.(state.total)
  }, [state, onTotal])

  // A record of this model was saved elsewhere (a peek, say): show it as saved.
  // A record this list doesn't have yet (just created, say a person added
  // under this company) means the list itself changed: fetch it again.
  useRecordChanged((change) => {
    if (change.model.app_label !== appLabel || change.model.model !== model) return
    const known =
      state.status === 'ready' &&
      Object.values(state.pages).some((rows) => rows.some((row) => row.id === change.record.id))
    // Archived or restored: it no longer belongs in this list (or now does).
    const belongs = !archiveField || (change.record.values[archiveField] === false) === showArchived
    if (known && belongs) replaceRecord(change.record)
    else retry()
  })

  // Re-render when a peek opens or closes, so the open record's row can say so.
  useLocation()

  // Keyboard: one tab stop for the whole list, arrows inside it. `activeIndex`
  // is the row that tab stop sits on.
  const [activeIndex, setActiveIndex] = useState(0)
  // One cell at a time can be in the editor; one cell at a time shows "saved".
  const [editing, setEditing] = useState<{ index: number; field: string } | null>(null)
  const [savedCell, setSavedCell] = useState<{ index: number; field: string } | null>(null)
  useEffect(() => {
    if (!savedCell) return
    const timeout = setTimeout(() => setSavedCell(null), 1400)
    return () => clearTimeout(timeout)
  }, [savedCell])

  const total = state.status === 'ready' ? state.total : 0
  const data = useMemo<Slot[]>(
    () => Array.from({ length: total }, (_, index) => ({ record: getRow(index) })),
    [total, getRow],
  )

  const rowHeight = useMemo(() => tokenPx(DENSITY_TOKEN[density], 34), [density])
  const columns = useMemo<ColumnDef<typeof features, Slot>[]>(() => {
    const defaultWidth = tokenPx('--column-default-width', 180)
    const minWidth = tokenPx('--column-min-width', 80)
    return visibleColumns.map((name, columnIndex) => {
      const field = schema.fields[name]
      const share = (TYPE_WIDTH[field.type] ?? 1) * (columnIndex === 0 ? 1.35 : 1)
      return {
        id: name,
        header: field.label,
        accessorFn: (slot: Slot) => slot.record?.values[name],
        size: Math.max(minWidth, Math.round(defaultWidth * share)),
        minSize: minWidth,
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
  }, [schema, visibleColumns])

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

  // A new sort or search is a new list — back to the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [ordering, query])

  const rows = table.getRowModel().rows
  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const minColumnWidth = useMemo(() => tokenPx('--column-min-width', 80), [])
  const widths = userSized
    ? headers.map((header) => header.getSize())
    : fitSizes(
        headers.map((header) => header.getSize()),
        headers.map(() => minColumnWidth),
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
      { app_label: appLabel, model },
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
      emitRecordChanged({ app_label: appLabel, model }, saved)
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
                emitRecordChanged({ app_label: appLabel, model }, restored)
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

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
    // Keys typed into an inline editor never reach here (it stops them).
    if (event.target !== event.currentTarget) return
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 400) / rowHeight) - 1)
    switch (event.key) {
      case 'Enter':
        openRow(index, event)
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
        if (first) {
          event.preventDefault()
          setEditing({ index, field: first })
        }
        break
      }
    }
  }

  const shownRows = embedded && maxRows != null ? Math.min(total, maxRows) : total


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
          {showArchived ? `Archived ${plural}` : capitalize(plural)}
          {state.status === 'ready' && (
            <span className="list-toolbar__count">{total.toLocaleString()}</span>
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
            onDensity={(next) => prefs.set({ density: next, hidden, extra })}
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
              ...hidden,
              ...Object.keys(schema.fields).filter(
                (id) => !schema.list.columns.includes(id) && !extra.includes(id),
              ),
            ]}
            onToggleColumn={(id) => {
              if (schema.list.columns.includes(id)) {
                prefs.set({
                  density,
                  extra,
                  hidden: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id],
                })
              } else {
                prefs.set({
                  density,
                  hidden,
                  extra: extra.includes(id) ? extra.filter((e) => e !== id) : [...extra, id],
                })
              }
            }}
            onResetColumns={() => prefs.set({ density, hidden: [], extra: [] })}
            customised={hidden.length > 0 || extra.length > 0}
            onRefresh={retry}
            refreshing={state.status === 'loading'}
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
              Archived
            </Button>
          )}
          {schema.actions.create && !showArchived && (
            <Button asChild className="h-[var(--control-height)]">
              <RecordRef model={{ app_label: appLabel, model }} id="new">
                <Plus className="size-4" aria-hidden />
                New {schema.verbose_name}
              </RecordRef>
            </Button>
          )}
        </div>
      </div>

      )}

      {!embedded && filter && Object.keys(filter).length > 0 && (
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

          {state.status === 'loading' && <SkeletonRows columns={widths} />}

          {state.status === 'error' && (
            <StatePanel icon={CloudOff} tone="danger" title={`Couldn’t load ${plural}`} message={state.message}>
              <Button variant="outline" onClick={retry} className="h-[var(--control-height)]">
                Try again
              </Button>
            </StatePanel>
          )}

          {embedded && state.status === 'ready' && total === 0 && (
            <p className="list-embedded-empty">None yet.</p>
          )}

          {!embedded && state.status === 'ready' && total === 0 && (
            query ? (
              <StatePanel
                icon={SearchX}
                title={`No ${showArchived ? 'archived ' : ''}${plural} match “${query}”`}
                message={`Search looks in ${schema.list.search_fields.map((f) => schema.fields[f]?.label ?? f).join(', ')}.`}
              >
                <Button variant="outline" onClick={() => setSearchInput('')} className="h-[var(--control-height)]">
                  Clear search
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
                    <RecordRef model={{ app_label: appLabel, model }} id="new">
                      <Plus className="size-4" aria-hidden />
                      New {schema.verbose_name}
                    </RecordRef>
                  </Button>
                )}
              </StatePanel>
            )
          )}

          {state.status === 'ready' && total > 0 && (
            <div className="list-body" style={{ height: virtualizer.getTotalSize() }}>
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index]
                if (!row) return null
                const record = row.original.record
                const loaded = record != null
                const open = loaded && isRecordHeld({ app_label: appLabel, model }, record.id)
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
                          model={{ app_label: appLabel, model }}
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
