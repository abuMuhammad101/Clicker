import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ModelRef } from '@/records'
import type { RelatedListSchema } from '@/types/schema'
import { RelatedList } from './RelatedLists'
import './RecordTabs.css'

/** Rows a related list shows in its own tab before "View all": a tab has the room a stacked list doesn't. */
const TAB_ROWS = 25

interface Tab {
  key: string
  label: string
  count?: number | null
  panel: ReactNode
}

/** The More tab's own key: it opens a menu, and stands for whichever folded list is open. */
const MORE = '__more'

/**
 * What a record has, one tab each: its related lists (in the schema's order) and its activity. The lists with
 * nothing in them fold into one More tab at the end, so the strip carries only what the record has; choosing one
 * from More opens it (its Add lives there) and the More tab takes its name while it is open. Every panel stays
 * mounted, so each list's count arrives without opening it and a tab keeps its state when you come back. Arrow
 * keys, Home and End move between tabs (the WAI-ARIA tabs pattern). Nothing here knows a model.
 */
export function RecordTabs({
  parent,
  lists,
  activity,
}: {
  parent: ModelRef & { id: number }
  lists: RelatedListSchema[]
  activity: ReactNode
}) {
  const [totals, setTotals] = useState<Record<string, number>>({})
  const report = useCallback(
    (key: string, total: number) => setTotals((current) => (current[key] === total ? current : { ...current, [key]: total })),
    [],
  )
  const listTabs: Tab[] = lists.map((list) => ({
    key: list.name,
    label: list.label,
    count: totals[list.name] ?? null,
    panel: <RelatedList parent={parent} list={list} bare rows={TAB_ROWS} onTotal={(total) => report(list.name, total)} />,
  }))
  // Until a list's count arrives it keeps its own tab; once it is known to be empty, it folds into More.
  const shown: Tab[] = [...listTabs.filter((tab) => tab.count !== 0), { key: 'activity', label: 'Activity', panel: activity }]
  const folded = listTabs.filter((tab) => tab.count === 0)
  const panels = [...shown, ...folded]

  const [active, setActive] = useState(shown[0]?.key ?? 'activity')
  const [chosen, setChosen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const choose = (key: string) => {
    setActive(key)
    setChosen(true)
  }
  // The page opens on the first list with something in it. If the one it started on turns out to be empty once
  // its count arrives, it moves on, unless you chose it yourself.
  const firstShown = shown[0]?.key
  useEffect(() => {
    if (!chosen && firstShown && folded.some((tab) => tab.key === active)) setActive(firstShown)
  }, [chosen, firstShown, folded, active])
  const id = useId()
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})

  const openFolded = folded.find((tab) => tab.key === active)
  // The strip, in order, as keyboard focus walks it: More is one stop at the end.
  const stops = [...shown.map((tab) => tab.key), ...(folded.length > 0 ? [MORE] : [])]

  const move = (event: KeyboardEvent, key: string) => {
    const index = stops.indexOf(key)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? stops.length - 1 : step ? (index + step + stops.length) % stops.length : -1
    if (to < 0) return
    event.preventDefault()
    const next = stops[to]
    if (!next) return
    // Moving onto More focuses it without choosing for you; Enter or Down opens its menu.
    if (next !== MORE) choose(next)
    buttons.current[next]?.focus()
  }

  return (
    <div className="record-tabs">
      <div className="record-tabs__list" role="tablist" aria-label="What this record has">
        {shown.map((tab) => {
          const selected = tab.key === active
          return (
            <button
              key={tab.key}
              ref={(node) => {
                buttons.current[tab.key] = node
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`${id}-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              className={cn('record-tabs__tab', selected && 'record-tabs__tab--active')}
              onClick={() => choose(tab.key)}
              onKeyDown={(event) => move(event, tab.key)}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && <span className="record-tabs__count">{tab.count.toLocaleString()}</span>}
            </button>
          )
        })}

        {folded.length > 0 && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                ref={(node) => {
                  buttons.current[MORE] = node
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${MORE}`}
                aria-selected={!!openFolded}
                aria-haspopup="dialog"
                aria-controls={openFolded ? `${id}-panel-${openFolded.key}` : undefined}
                tabIndex={openFolded ? 0 : -1}
                className={cn('record-tabs__tab', 'record-tabs__more', openFolded && 'record-tabs__tab--active')}
                onKeyDown={(event) => move(event, MORE)}
              >
                {openFolded ? openFolded.label : 'More'}
                {!openFolded && <span className="record-tabs__count">{folded.length}</span>}
                <ChevronDown className="record-tabs__chevron" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={6} className="record-tabs__menu" aria-label="Lists with nothing in them yet">
              <p className="record-tabs__menu-note">Nothing here yet</p>
              {folded.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-current={tab.key === active ? 'true' : undefined}
                  className={cn('record-tabs__menu-item', tab.key === active && 'record-tabs__menu-item--on')}
                  onClick={() => {
                    choose(tab.key)
                    setMenuOpen(false)
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {panels.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${id}-panel-${tab.key}`}
          aria-labelledby={`${id}-tab-${folded.includes(tab) ? MORE : tab.key}`}
          hidden={tab.key !== active}
          className="record-tabs__panel"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  )
}
