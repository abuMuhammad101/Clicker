import { useEffect, type RefObject } from 'react'
import { Check, Columns3, Group, RefreshCw, Rows2, Rows3, Rows4, Search, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Density } from './listPrefs'

/**
 * The search box: quiet until you want it (a tinted well, no outline), a
 * clear outline and a little more room once you're in it, and a "/" hint
 * while it's idle. "/" focuses it from anywhere on the page that isn't a
 * text field.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  inputRef: RefObject<HTMLInputElement | null>
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inputRef])

  return (
    <div className="list-search">
      <Search className="list-search__icon" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        className="list-search__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          if (value) onChange('')
          else event.currentTarget.blur()
        }}
        placeholder={placeholder}
        aria-label={placeholder.replace('…', '')}
        aria-keyshortcuts="/"
      />
      {value ? (
        <button type="button" className="list-search__clear" onClick={() => onChange('')} aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd className="kbd list-search__hint" aria-hidden>
          /
        </kbd>
      )}
    </div>
  )
}

const DENSITIES: { value: Density; label: string; Icon: typeof Rows3 }[] = [
  { value: 'compact', label: 'Compact rows', Icon: Rows4 },
  { value: 'default', label: 'Default rows', Icon: Rows3 },
  { value: 'comfortable', label: 'Comfortable rows', Icon: Rows2 },
]

/** The table's own controls: row density, grouping, which columns show, reload. */
export function ListControls({
  density,
  onDensity,
  columns,
  hidden,
  onToggleColumn,
  onResetColumns,
  customised,
  onRefresh,
  refreshing,
  groupable = [],
  groupBy = null,
  onGroupBy,
}: {
  density: Density
  onDensity: (density: Density) => void
  columns: { id: string; label: string }[]
  hidden: string[]
  onToggleColumn: (id: string) => void
  onResetColumns: () => void
  /** Whether the columns differ from the list's defaults (offers "Reset"). */
  customised: boolean
  onRefresh: () => void
  refreshing: boolean
  /** Fields the list can be grouped by; none hides the control. */
  groupable?: { id: string; label: string }[]
  groupBy?: string | null
  onGroupBy?: (field: string | null) => void
}) {
  const visibleCount = columns.length - hidden.length
  return (
    <TooltipProvider>
      <div className="list-controls" role="toolbar" aria-label="Table options">
        <div className="list-controls__group" role="group" aria-label="Row density">
          {DENSITIES.map(({ value, label, Icon }) => (
            <Tooltip key={value} label={label} side="bottom">
              <button
                type="button"
                className={cn('list-controls__button', density === value && 'list-controls__button--on')}
                aria-pressed={density === value}
                aria-label={label}
                onClick={() => onDensity(value)}
              >
                <Icon aria-hidden />
              </button>
            </Tooltip>
          ))}
        </div>

        {groupable.length > 0 && onGroupBy && (
          <Popover>
            <Tooltip label={groupBy ? `Grouped by ${groupable.find((g) => g.id === groupBy)?.label.toLowerCase() ?? groupBy}` : 'Group'} side="bottom">
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn('list-controls__button', groupBy && 'list-controls__button--on')}
                  aria-label="Group rows"
                  aria-pressed={!!groupBy}
                >
                  <Group aria-hidden />
                </button>
              </PopoverTrigger>
            </Tooltip>
            <PopoverContent align="end" className="list-columns">
              <p className="list-columns__title">Group by</p>
              <ul className="list-columns__list">
                {[{ id: '', label: 'No grouping' }, ...groupable].map((option) => {
                  const on = (groupBy ?? '') === option.id
                  return (
                    <li key={option.id || 'none'}>
                      <button
                        type="button"
                        className="list-columns__item list-group-option"
                        aria-pressed={on}
                        onClick={() => onGroupBy(option.id || null)}
                      >
                        <Check className={cn('list-group-option__check', !on && 'invisible')} aria-hidden />
                        <span>{option.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </PopoverContent>
          </Popover>
        )}

        <Popover>
          <Tooltip label="Columns" side="bottom">
            <PopoverTrigger asChild>
              <button type="button" className="list-controls__button" aria-label="Choose columns">
                <Columns3 aria-hidden />
              </button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent align="end" className="list-columns">
            <p className="list-columns__title">Columns</p>
            <ul className="list-columns__list">
              {columns.map((column) => {
                const shown = !hidden.includes(column.id)
                // At least one column always stays.
                const locked = shown && visibleCount === 1
                return (
                  <li key={column.id}>
                    <label className={cn('list-columns__item', locked && 'list-columns__item--locked')}>
                      <Checkbox
                        checked={shown}
                        disabled={locked}
                        onCheckedChange={() => onToggleColumn(column.id)}
                      />
                      <span>{column.label}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            {customised && (
              <button type="button" className="list-columns__reset" onClick={onResetColumns}>
                Reset to default
              </button>
            )}
          </PopoverContent>
        </Popover>

        <Tooltip label="Reload" side="bottom">
          <button
            type="button"
            className={cn('list-controls__button', refreshing && 'list-controls__button--busy')}
            aria-label="Reload"
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden />
          </button>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
