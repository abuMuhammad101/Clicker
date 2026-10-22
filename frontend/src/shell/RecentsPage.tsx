import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, ApiError } from '@/lib/api'
import type { User } from '@/features/auth/authContext'
import { Link } from '@/lib/Link'
import { RecordRef } from '@/records'
import type { RegistryApp } from './useRegistry'
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
export function RecentsPage({
  user,
  apps,
  onLabelChange,
}: {
  user: User
  /** From the registry, so the empty state can point at a real first step. */
  apps: RegistryApp[] | null
  onLabelChange: (label: string | null) => void
}) {
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

  const firstModel = apps?.[0]?.models[0]

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return (
    <div className="recents">
      <h1 className="recents__greeting">
        {greeting()}, {firstName(user.display_name)}
      </h1>
      <p className="recents__sub">Pick up where you left off.</p>

      {state.status === 'loading' && (
        <div className="recents__table" aria-busy="true" aria-label="Loading recent records">
          <div className="recents__row recents__head">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ml-auto h-3 w-10" />
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="recents__row">
              <Skeleton className="h-3" style={{ width: `${70 - (i % 3) * 14}%` }} />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="ml-auto h-3 w-14" />
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
        <div className="recents__empty">
          <div className="recents__ghost" aria-hidden="true">
            {[72, 56, 64, 48].map((width, i) => (
              <div key={i} className="recents__ghost-row">
                <span style={{ width: `${width}%` }} />
              </div>
            ))}
          </div>
          <p className="recents__state-title">Nothing here yet</p>
          <p className="recents__state-text">The records you open will show up here, newest first.</p>
          {firstModel && (
            <Button asChild variant="outline" className="h-[var(--control-height)]">
              <Link to={firstModel.route}>Browse {firstModel.label.toLowerCase()}</Link>
            </Button>
          )}
        </div>
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <div className="recents__table" role="table" aria-label="Recently viewed records">
          <div className="recents__row recents__head" role="row">
            <span role="columnheader">Recently viewed</span>
            <span role="columnheader">Type</span>
            <span role="columnheader">Module</span>
            <span role="columnheader" className="recents__when">
              When
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

function greeting() {
  const hour = new Date().getHours()
  return hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || displayName
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
