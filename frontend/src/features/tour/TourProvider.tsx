import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { apiGet } from '@/lib/api'
import { navigate } from '@/lib/router'
import { usePreference } from '@/lib/usePreference'
import {
  fillNumbers,
  findAnchors,
  nextIndex,
  place,
  progressLabel,
  resumable,
  type Tour,
  type TourProgress,
  type TourStep,
} from './tourLogic'
import './tour.css'

interface TourContextValue {
  /** The tour for this journey, narrowed to what this person may see; null when the journey has none. */
  tour: Tour | null
  progress: TourProgress | null
  running: boolean
  canResume: boolean
  /** From the first step (the Help menu, the welcome link). */
  start: () => void
  /** From where it was paused. */
  resume: () => void
}

const TourContext = createContext<TourContextValue>({
  tour: null,
  progress: null,
  running: false,
  canResume: false,
  start: () => undefined,
  resume: () => undefined,
})

export function useTour() {
  return useContext(TourContext)
}

const ANCHOR_WAIT_MS = 4000
/** A step that may not apply to the live data (it says so in the manifest) is not waited for long. */
const OPTIONAL_WAIT_MS = 1200

async function openRecordPath(step: TourStep): Promise<string | null> {
  const spec = step.open_record
  if (!spec) return null
  const [app, model] = spec.model.split('.')
  const params = new URLSearchParams({ limit: '1' })
  if (spec.filter) params.set('filter', spec.filter)
  if (spec.q) params.set('q', spec.q)
  try {
    const { results } = await apiGet<{ results: { id: number }[] }>(`/data/${app}/${model}/?${params}`)
    return results[0] ? `/${app}/${model}/${results[0].id}` : null
  } catch {
    return null
  }
}

const here = () => window.location.pathname + window.location.search
const sameRoute = (a: string, b: string) => decodeURIComponent(a) === decodeURIComponent(b)

/**
 * The guided tour: one generic engine over a manifest (`tours/<journey>.json`, served already narrowed to the
 * person's permissions). It moves between screens, finds each step's `data-tour` anchor, lights it and says a
 * sentence about it. It can be paused and picked up again, skipped for good, and restarted from the Help menu.
 * Nothing here knows a module: the manifest names generic anchors, never a model.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const [tour, setTour] = useState<Tour | null>(null)
  const { value: progress, set: setProgress } = usePreference<TourProgress | null>('tour.progress', null)
  const [index, setIndex] = useState<number | null>(null)
  const direction = useRef<1 | -1>(1)
  const skipped = useRef(new Set<number>())

  useEffect(() => {
    let cancelled = false
    apiGet<{ tour: Tour | null }>('/tour/')
      .then((body) => !cancelled && setTour(body.tour))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const begin = useCallback((at: number) => {
    skipped.current = new Set()
    direction.current = 1
    setIndex(at)
  }, [])

  const stop = useCallback(
    (next: TourProgress | null) => {
      setIndex(null)
      if (next) setProgress(next)
    },
    [setProgress],
  )

  const move = useCallback(
    (to: 1 | -1) => {
      if (!tour || index == null) return
      direction.current = to
      const target = nextIndex(index, tour.steps.length, to, skipped.current)
      if (target == null) {
        if (to === 1) stop({ tour: tour.id, status: 'done' })
        return
      }
      setIndex(target)
    },
    [tour, index, stop],
  )

  const value = useMemo<TourContextValue>(
    () => ({
      tour,
      progress,
      running: index != null,
      canResume: !!tour && resumable(progress, tour.id),
      start: () => begin(0),
      resume: () => begin(progress && progress.status === 'paused' ? Math.min(progress.index, (tour?.steps.length ?? 1) - 1) : 0),
    }),
    [tour, progress, index, begin],
  )

  return (
    <TourContext.Provider value={value}>
      {children}
      {tour && index != null && createPortal(<TourStage tour={tour} index={index} skipped={skipped} direction={direction} move={move} pause={() => stop({ tour: tour.id, status: 'paused', index })} skip={() => stop({ tour: tour.id, status: 'skipped' })} />, document.body)}
    </TourContext.Provider>
  )
}

interface StageProps {
  tour: Tour
  index: number
  skipped: React.MutableRefObject<Set<number>>
  direction: React.MutableRefObject<1 | -1>
  move: (to: 1 | -1) => void
  pause: () => void
  skip: () => void
}

function TourStage({ tour, index, skipped, direction, move, pause, skip }: StageProps) {
  const step = tour.steps[index]
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [body, setBody] = useState(step.body)
  const card = useRef<HTMLDivElement>(null)
  const [cardSize, setCardSize] = useState({ width: 340, height: 190 })
  const last = index === tour.steps.length - 1

  // Go to the step's screen, then wait for its anchor; a step whose anchor never comes is skipped without a word.
  useEffect(() => {
    let cancelled = false
    setAnchor(null)
    setRect(null)
    const run = async () => {
      const wanted = step.open_record ? await openRecordPath(step) : step.route ?? null
      if (cancelled) return
      if (step.open_record && !wanted) return give(true)
      if (wanted && !sameRoute(wanted, here())) navigate(wanted)
      const started = Date.now()
      const poll = window.setInterval(() => {
        if (cancelled) return window.clearInterval(poll)
        const found = findAnchors(step)[0]
        if (found) {
          window.clearInterval(poll)
          found.scrollIntoView({ block: 'center', behavior: 'auto' })
          setBody(fillNumbers(step.body))
          setAnchor(found)
        } else if (Date.now() - started > (step.optional ? OPTIONAL_WAIT_MS : ANCHOR_WAIT_MS)) {
          window.clearInterval(poll)
          give(false)
        }
      }, 120)
      return () => window.clearInterval(poll)
    }
    const give = (record: boolean) => {
      if (import.meta.env.DEV) console.debug(`[tour] skipping "${step.id}": ${record ? 'no record to open' : `no anchor ${step.target}${step.match ? ` ~ ${step.match}` : ''}`}`)
      skipped.current.add(index)
      move(direction.current)
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // Follow the anchor while the page moves under it.
  useEffect(() => {
    if (!anchor) return
    const measure = () => {
      if (!anchor.isConnected) return
      const r = anchor.getBoundingClientRect()
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height })
      if (card.current) setCardSize({ width: card.current.offsetWidth, height: card.current.offsetHeight })
    }
    measure()
    const timer = window.setInterval(measure, 200)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [anchor])

  // The step moves on by itself when the person does the thing it asked for.
  useEffect(() => {
    const until = step.until
    if (!anchor || !until) return
    if (until.type === 'click') {
      const onClick = (event: MouseEvent) => {
        const hit = (event.target as Element | null)?.closest(`[data-tour="${until.target ?? step.target}"]`)
        if (hit) window.setTimeout(() => move(1), 700)
      }
      document.addEventListener('click', onClick, true)
      return () => document.removeEventListener('click', onClick, true)
    }
    const timer = window.setInterval(() => {
      const done = until.type === 'route' ? window.location.pathname.startsWith(until.value) : findAnchors(until).length > 0
      if (done) move(1)
    }, 250)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, index])

  // Keyboard: arrows, and Esc to put it down (it can be picked up again).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return
      if (event.key === 'Escape') { event.preventDefault(); pause() }
      else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, pause])

  // Focus moves to the step, which is announced politely.
  useEffect(() => {
    if (anchor) card.current?.focus({ preventScroll: true })
  }, [anchor, index])

  const placed = rect ? place(rect, cardSize, { width: window.innerWidth, height: window.innerHeight }, step.placement ?? 'bottom') : null
  const titleId = `tour-title-${step.id}`
  const pad = 4
  return (
    <>
      <div className="tour-live" role="status" aria-live="polite">
        {anchor ? `Step ${progressLabel(index, tour.steps.length)}: ${step.title}` : ''}
      </div>
      {rect && (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      {placed && (
        <div
          ref={card}
          className="tour-card"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          tabIndex={-1}
          style={{ left: placed.left, top: placed.top }}
        >
          <p className="tour-card__progress">{progressLabel(index, tour.steps.length)}</p>
          <h2 id={titleId} className="tour-card__title">{step.title}</h2>
          <p className="tour-card__body">{body}</p>
          {last && tour.ending && <p className="tour-card__ending">{tour.ending}</p>}
          <div className="tour-card__actions">
            <Button type="button" variant="ghost" onClick={skip} className="h-[var(--control-height)] text-[color:var(--text-muted)]">
              Skip tour
            </Button>
            <span className="tour-card__spacer" />
            {index > 0 && (
              <Button type="button" variant="outline" onClick={() => move(-1)} className="h-[var(--control-height)]">
                Back
              </Button>
            )}
            <Button type="button" onClick={() => move(1)} className="h-[var(--control-height)]">
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
