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
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { isNumericType, renderListCell } from '@/fields/listRegistry'
import { ListCell } from '@/fields/shared/ListCell'
import { tokenPx } from '@/lib/tokens'
import { useModelSchema } from '@/lib/useModelSchema'
import { isVisible } from '@/lib/visibility'
import { cn } from '@/lib/utils'
import type { RecordEnvelope } from '@/types/record'
import type { ModelSchema } from '@/types/schema'
import { useRecordWindow } from './useRecordWindow'
import './ListRenderer.css'

/**
 * Renders any exposed model's list from its schema. Same law as the form
 * renderer: nothing here may know which model it is showing.
 */
interface ListRendererProps {
  appLabel: string
  model: string
}

const features = tableFeatures({ rowSortingFeature, columnSizingFeature, columnResizingFeature })

/** A slot in the list: the record once its page has loaded, null until then. */
interface Slot {
  record: RecordEnvelope | null
}

const SEARCH_DEBOUNCE_MS = 250
const OVERSCAN_ROWS = 12

export function ListRenderer(props: ListRendererProps) {
  // Retry = remount, so the schema fetch restarts from scratch.
  const [attempt, setAttempt] = useState(0)
  return <ListLoader key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />
}

function ListLoader({ appLabel, model, onRetry }: ListRendererProps & { onRetry: () => void }) {
  const schemaState = useModelSchema(appLabel, model)

  if (schemaState.status === 'error') {
    return (
      <div className="list-page">
        <LoadError message={schemaState.message} onRetry={onRetry} />
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
  return <ListView schema={schemaState.schema} appLabel={appLabel} model={model} />
}

function initialSorting(schema: ModelSchema): SortingState {
  return schema.list.sort
    .filter((sort) => schema.list.columns.includes(sort.field))
    .map((sort) => ({ id: sort.field, desc: sort.direction === 'desc' }))
}

function recordUrl(appLabel: string, model: string, id: number) {
  return `/${appLabel}/${model}/${id}`
}

function ListView({
  schema,
  appLabel,
  model,
}: {
  schema: ModelSchema
  appLabel: string
  model: string
}) {
  const [sorting, setSorting] = useState<SortingState>(() => initialSorting(schema))
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const timeout = setTimeout(() => setQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    document.title = `${capitalize(schema.verbose_name_plural)} · Clicker`
  }, [schema.verbose_name_plural])

  const ordering = sorting.map((sort) => (sort.desc ? '-' : '') + sort.id).join(',')
  const { state, getRow, ensureRange, retry } = useRecordWindow(appLabel, model, ordering, query)

  const total = state.status === 'ready' ? state.total : 0
  const data = useMemo<Slot[]>(
    () => Array.from({ length: total }, (_, index) => ({ record: getRow(index) })),
    [total, getRow],
  )

  const rowHeight = useMemo(() => tokenPx('--row-height', 34), [])
  const columns = useMemo<ColumnDef<typeof features, Slot>[]>(() => {
    const defaultWidth = tokenPx('--column-default-width', 180)
    const minWidth = tokenPx('--column-min-width', 80)
    return schema.list.columns.map((name) => {
      const field = schema.fields[name]
      return {
        id: name,
        header: field.label,
        accessorFn: (slot: Slot) => slot.record?.values[name],
        size: defaultWidth,
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
          return renderListCell({
            schema: field,
            value: record.values[name],
            label: record.labels[name] ?? null,
          })
        },
      }
    })
  }, [schema])

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
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN_ROWS,
  })

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
  const totalWidth = table.getTotalSize()
  const plural = schema.verbose_name_plural

  const openRow = (index: number, event: React.MouseEvent | React.KeyboardEvent) => {
    const record = getRow(index)
    if (!record) return
    // Links inside a cell (email, url) keep doing their own thing.
    if ((event.target as HTMLElement).closest('a')) return
    const url = recordUrl(appLabel, model, record.id)
    if ('metaKey' in event && (event.metaKey || event.ctrlKey)) window.open(url, '_blank')
    else window.location.assign(url)
  }

  return (
    <div className="list-page">
      <div className="list-toolbar">
        <h1 className="list-toolbar__title">
          {capitalize(plural)}
          {state.status === 'ready' && (
            <span className="list-toolbar__count">{total.toLocaleString()}</span>
          )}
        </h1>
        <div className="list-search">
          <Search className="list-search__icon" aria-hidden />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setSearchInput('')}
            placeholder={`Search ${plural}…`}
            aria-label={`Search ${plural}`}
            className="list-search__input"
          />
          {searchInput && (
            <button
              type="button"
              className="list-search__clear"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="list-scroll">
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
                  style={{ width: header.getSize() }}
                >
                  <button
                    type="button"
                    className="list-header__sort"
                    onClick={header.column.getToggleSortingHandler()}
                    title={field.label}
                  >
                    <span className="list-header__label">{field.label}</span>
                    {sorted === 'asc' && <ArrowUp className="list-header__arrow" aria-hidden />}
                    {sorted === 'desc' && <ArrowDown className="list-header__arrow" aria-hidden />}
                  </button>
                  <div
                    className={cn(
                      'list-header__resizer',
                      header.column.getIsResizing() && 'list-header__resizer--active',
                    )}
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

          {state.status === 'loading' && <SkeletonRows columns={headers.map((h) => h.getSize())} />}

          {state.status === 'error' && (
            <div className="list-state">
              <p className="list-state__title">Couldn’t load {plural}</p>
              <p className="list-state__message">{state.message}</p>
              <Button variant="outline" onClick={retry} className="h-[var(--control-height)]">
                Try again
              </Button>
            </div>
          )}

          {state.status === 'ready' && total === 0 && (
            <div className="list-state">
              {query ? (
                <>
                  <p className="list-state__title">No {plural} match “{query}”</p>
                  <p className="list-state__message">
                    Search looks in{' '}
                    {schema.list.search_fields.map((f) => schema.fields[f]?.label ?? f).join(', ')}.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSearchInput('')}
                    className="h-[var(--control-height)]"
                  >
                    Clear search
                  </Button>
                </>
              ) : (
                <p className="list-state__title">No {plural} yet</p>
              )}
            </div>
          )}

          {state.status === 'ready' && total > 0 && (
            <div className="list-body" style={{ height: virtualizer.getTotalSize() }}>
              {virtualRows.map((virtualRow) => {
                const row = rows[virtualRow.index]
                if (!row) return null
                const loaded = row.original.record != null
                return (
                  <div
                    key={virtualRow.key}
                    role="row"
                    aria-rowindex={virtualRow.index + 1}
                    tabIndex={loaded ? 0 : -1}
                    className={cn('list-row', !loaded && 'list-row--pending')}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                    onClick={(event) => openRow(virtualRow.index, event)}
                    onKeyDown={(event) => event.key === 'Enter' && openRow(virtualRow.index, event)}
                  >
                    {row.getAllCells().map((cell) => (
                      <div
                        key={cell.id}
                        role="cell"
                        className={cn(
                          'list-row__cell',
                          isNumericType(schema.fields[cell.column.id].type) && 'list-row__cell--numeric',
                        )}
                        style={{ width: cell.column.getSize() }}
                      >
                        <table.FlexRender cell={cell} />
                      </div>
                    ))}
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
    <div className="list-state">
      <p className="list-state__title">Couldn’t load this list</p>
      <p className="list-state__message">{message}</p>
      <Button variant="outline" onClick={onRetry} className="h-[var(--control-height)]">
        Try again
      </Button>
    </div>
  )
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
