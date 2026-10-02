import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, ApiError } from '@/lib/api'
import { RecordRef } from '@/records'
import './recents.css'

/** Mirrors backend/userstate/views.py's RecentsView. */
interface RecentItem {
  app_label: string
  app: string
  model: string
  model_label: string
  id: number
  display: string
  viewed_at: string
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: RecentItem[] }

/**
 * The home page: what you were last looking at, not a dashboard. Model,
 * name, module and when, each a RecordRef like any other pointer at a record.
 * Nothing here names a module or a model; the backend describes each row.
 */
export function RecentsPage({ onLabelChange }: { onLabelChange: (label: string | null) => void }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    onLabelChange('Recent')
    return () => onLabelChange(null)
  }, [onLabelChange])

  useEffect(() => {
    let cancelled = false
    apiGet<{ results: RecentItem[] }>('/recents/')
      .then(({ results }) => !cancelled && setState({ status: 'ready', items: results }))
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Could not reach the API.' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return (
    <div className="recents">
      <h1 className="recents__title">Recent</h1>

      {state.status === 'loading' && (
        <div aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="recents__row recents__row--static">
              <Skeleton className="h-3 w-2/5" />
            </div>
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="recents__state" role="alert">
          <p className="recents__state-title">Couldn’t load your recent records</p>
          <p className="recents__state-text">{state.message}</p>
          <Button variant="outline" onClick={retry} className="h-[var(--control-height)]">
            Try again
          </Button>
        </div>
      )}

      {state.status === 'ready' && state.items.length === 0 && (
        <div className="recents__state">
          <p className="recents__state-title">Nothing yet</p>
          <p className="recents__state-text">Records you open will appear here.</p>
        </div>
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <div className="recents__table" role="table" aria-label="Recently viewed records">
          <div className="recents__row recents__head" role="row">
            <span role="columnheader">Record</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Module</span>
            <span role="columnheader" className="recents__when">
              Viewed
            </span>
          </div>
          {state.items.map((item) => (
            <RecordRef
              key={`${item.app_label}.${item.model}.${item.id}`}
              model={{ app_label: item.app_label, model: item.model }}
              id={item.id}
              className="recents__row recents__link"
              role="row"
            >
              <span role="cell" className="recents__name" title={item.display}>
                {item.display}
              </span>
              <span role="cell" className="recents__muted">
                {item.model_label}
              </span>
              <span role="cell" className="recents__muted">
                {item.app}
              </span>
              <time role="cell" className="recents__when" dateTime={item.viewed_at} title={new Date(item.viewed_at).toLocaleString()}>
                {relativeTime(item.viewed_at)}
              </time>
            </RecordRef>
          ))}
        </div>
      )}
    </div>
  )
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function relativeTime(iso: string) {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}
