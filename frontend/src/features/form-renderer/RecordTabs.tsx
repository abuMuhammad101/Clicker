import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
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

/**
 * What a record has, one tab each: its related lists (in the schema's order) and its activity. Every panel stays
 * mounted, so each list's count arrives without opening it and a tab keeps its scroll and state when you come
 * back. A list with nothing in it keeps its tab, quieter and without a count, because "Add" lives there.
 * Arrow keys move between tabs (the WAI-ARIA tabs pattern). Nothing here knows a model.
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
  // What the record has comes first, then its activity, then the lists with nothing in them: when the strip runs
  // out of room it is the empty ones that go past the edge, never Activity.
  const tabs: Tab[] = [
    ...listTabs.filter((tab) => tab.count !== 0),
    { key: 'activity', label: 'Activity', panel: activity },
    ...listTabs.filter((tab) => tab.count === 0),
  ]
  const [active, setActive] = useState(tabs[0]?.key ?? 'activity')
  const id = useId()
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})

  // More tabs than room: the strip scrolls, and its right edge fades while there is more past it.
  const strip = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const measure = useCallback(() => {
    const node = strip.current
    if (node) setMore(node.scrollLeft + node.clientWidth < node.scrollWidth - 1)
  }, [])
  useEffect(() => {
    const node = strip.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [measure])
  useEffect(measure, [measure, totals])

  const move = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : step ? (index + step + tabs.length) % tabs.length : -1
    if (to < 0) return
    event.preventDefault()
    const next = tabs[to]
    if (!next) return
    setActive(next.key)
    buttons.current[next.key]?.focus()
    buttons.current[next.key]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  return (
    <div className="record-tabs">
      <div
        ref={strip}
        className={cn('record-tabs__list', more && 'record-tabs__list--more')}
        role="tablist"
        aria-label="What this record has"
        onScroll={measure}
      >
        {tabs.map((tab, index) => {
          const selected = tab.key === active
          const empty = tab.count === 0
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
              className={cn('record-tabs__tab', selected && 'record-tabs__tab--active', empty && 'record-tabs__tab--empty')}
              onClick={() => setActive(tab.key)}
              onKeyDown={(event) => move(event, index)}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && <span className="record-tabs__count">{tab.count.toLocaleString()}</span>}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          role="tabpanel"
          id={`${id}-panel-${tab.key}`}
          aria-labelledby={`${id}-tab-${tab.key}`}
          hidden={tab.key !== active}
          className="record-tabs__panel"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  )
}
