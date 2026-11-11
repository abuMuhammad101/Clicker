import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
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

/** The More tab's own key: it opens a menu, and stands for whichever tab in it is open. */
const MORE = '__more'

/**
 * What a record has, one tab each: its details (when its container has no room for them beside the tabs), its
 * related lists in the schema's order, and its activity. The strip carries as many as fit whole; the rest, and
 * every list with nothing in it, fold into one More tab at the end. Choosing one from More opens it and the More
 * tab takes its name while it is open. The strip measures its own width, so a drawer and a page each get the
 * tabs that fit them without either being named here. Every panel stays mounted, so each list's count arrives
 * without opening it and a tab keeps its state when you come back. Arrow keys, Home and End move between tabs
 * (the WAI-ARIA tabs pattern). Nothing here knows a model.
 */
export function RecordTabs({
  parent,
  lists,
  activity,
  details,
}: {
  parent: ModelRef & { id: number }
  lists: RelatedListSchema[]
  activity: ReactNode
  /** Given, the record's fields are the first tab. */
  details?: ReactNode
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
  // In strip order: the record's details, what it has (a list keeps its tab until its count says it is empty),
  // then its activity. Empty lists only ever live in More.
  const primary: Tab[] = [
    ...(details ? [{ key: 'details', label: 'Details', panel: details }] : []),
    ...listTabs.filter((tab) => tab.count !== 0),
    { key: 'activity', label: 'Activity', panel: activity },
  ]
  const empty = listTabs.filter((tab) => tab.count === 0)

  // How many of the primary tabs fit whole, measured from an unseen copy of the strip.
  const strip = useRef<HTMLDivElement>(null)
  const ruler = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(primary.length)
  const primaryKey = primary.map((tab) => `${tab.key}:${tab.count ?? ''}`).join('|')
  const measure = useCallback(() => {
    const room = strip.current?.clientWidth ?? 0
    const sizes = [...(ruler.current?.children ?? [])].map((node) => (node as HTMLElement).offsetWidth)
    if (!room || sizes.length === 0) return
    const gap = parseFloat(getComputedStyle(ruler.current as HTMLElement).columnGap) || 0
    const moreWidth = sizes[sizes.length - 1] ?? 0
    const tabs = sizes.slice(0, -1)
    const total = tabs.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, tabs.length - 1)
    const needMore = empty.length > 0
    let count = tabs.length
    if (total + (needMore ? gap + moreWidth : 0) > room) {
      // Some must fold: keep as many as fit beside the More tab.
      let used = 0
      count = 0
      for (const size of tabs) {
        const next = used + (count > 0 ? gap : 0) + size
        if (next + gap + moreWidth > room) break
        used = next
        count += 1
      }
    }
    setFit(Math.max(1, count))
  }, [empty.length])
  // Re-measured when a tab's count arrives, and when More's own label changes (a tab inside it is opened).
  const [moreLabel, setMoreLabel] = useState('')
  useLayoutEffect(measure, [measure, primaryKey, moreLabel])
  useEffect(() => {
    const node = strip.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [measure])

  const shown = primary.slice(0, fit)
  const overflow = primary.slice(fit)
  const folded = [...overflow, ...empty]
  const panels = [...primary, ...empty]

  const [active, setActive] = useState(primary[0]?.key ?? 'activity')
  const [chosen, setChosen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const choose = (key: string) => {
    setActive(key)
    setChosen(true)
  }
  // It opens on the first tab. If that was a list that turns out empty once its count arrives, it moves on,
  // unless you chose it yourself.
  const first = primary[0]?.key
  const panelKeys = [...primary, ...empty].map((tab) => tab.key).join('|')
  useEffect(() => {
    // A tab that is gone (Details, once there is room for its column again) hands over to the first.
    if (first && !panelKeys.split('|').includes(active)) setActive(first)
    else if (!chosen && first && empty.some((tab) => tab.key === active)) setActive(first)
  }, [chosen, first, empty, active, panelKeys])

  const id = useId()
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})
  const openFolded = folded.find((tab) => tab.key === active)
  const nextMoreLabel = openFolded ? `${openFolded.key}:${openFolded.count ?? ''}` : `more:${folded.length}`
  useLayoutEffect(() => setMoreLabel(nextMoreLabel), [nextMoreLabel])
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

  const label = (tab: Tab) => (
    <>
      {tab.label}
      {tab.count != null && tab.count > 0 && <span className="record-tabs__count">{tab.count.toLocaleString()}</span>}
    </>
  )

  return (
    <div className="record-tabs">
      {/* An unseen copy of the strip, every primary tab and a full More, so the real one knows what fits. */}
      <div className="record-tabs__ruler-box" aria-hidden>
      <div ref={ruler} className="record-tabs__list record-tabs__ruler">
        {primary.map((tab) => (
          <span key={tab.key} className="record-tabs__tab">
            {label(tab)}
          </span>
        ))}
        {/* More as it will actually read: the open tab's name when one in it is open, else "More" and how many. */}
        <span className="record-tabs__tab record-tabs__more">
          {openFolded ? label(openFolded) : <>More<span className="record-tabs__count">{Math.max(folded.length, 1)}</span></>}
          <ChevronDown className="record-tabs__chevron" />
        </span>
      </div>
      </div>

      <div ref={strip} className="record-tabs__list" role="tablist" aria-label="What this record has">
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
              {label(tab)}
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
                {openFolded ? label(openFolded) : <>More<span className="record-tabs__count">{folded.length}</span></>}
                <ChevronDown className="record-tabs__chevron" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={6} className="record-tabs__menu" aria-label="More of this record">
              {overflow.map((tab) => (
                <MenuItem key={tab.key} tab={tab} on={tab.key === active} onChoose={() => { choose(tab.key); setMenuOpen(false) }} />
              ))}
              {empty.length > 0 && (
                <>
                  {overflow.length > 0 && <hr className="record-tabs__menu-rule" />}
                  <p className="record-tabs__menu-note">Nothing here yet</p>
                  {empty.map((tab) => (
                    <MenuItem key={tab.key} tab={tab} on={tab.key === active} onChoose={() => { choose(tab.key); setMenuOpen(false) }} />
                  ))}
                </>
              )}
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

function MenuItem({ tab, on, onChoose }: { tab: Tab; on: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      aria-current={on ? 'true' : undefined}
      className={cn('record-tabs__menu-item', on && 'record-tabs__menu-item--on')}
      onClick={onChoose}
    >
      <span className="record-tabs__menu-label">{tab.label}</span>
      {tab.count != null && tab.count > 0 && <span className="record-tabs__count">{tab.count.toLocaleString()}</span>}
    </button>
  )
}

/** Below this width a record's details are the first tab, not a column beside the tabs. */
const DETAILS_COLUMN_MIN = 900

/**
 * Reading a record: what it has in tabs, and what it is (its details) beside them when there is room, or as the
 * first tab when there isn't. It answers to its own width, never to the container's name: the same record reads
 * as tabs and a column on a page, and as tabs alone in a drawer.
 */
export function RecordView({
  parent,
  lists,
  activity,
  details,
}: {
  parent: ModelRef & { id: number }
  lists: RelatedListSchema[]
  activity: ReactNode
  details: ReactNode
}) {
  const element = useRef<HTMLDivElement>(null)
  // Unknown until measured (before the first paint), so the tabs start from the right first tab.
  const [wide, setWide] = useState<boolean | null>(null)
  useLayoutEffect(() => {
    const node = element.current
    if (!node) return
    const check = () => setWide(node.clientWidth >= DETAILS_COLUMN_MIN)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const body = <div className="record-details">{details}</div>
  return (
    <div ref={element} className={cn('record-view', wide === false && 'record-view--narrow')}>
      <div className="record-view__main">
        {wide != null && <RecordTabs parent={parent} lists={lists} activity={activity} details={wide ? undefined : body} />}
      </div>
      {wide && (
        <aside className="record-view__details" aria-label="Details">
          <h2 className="record-view__heading">Details</h2>
          {body}
        </aside>
      )}
    </div>
  )
}
