import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react'
import { CloudOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, ApiError } from '@/lib/api'
import { formatDate, formatDateTime, relativeTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { FieldSchema, ModelSchema } from '@/types/schema'
import './ActivityTrail.css'

/** One entry of a record's history, as the history endpoint sends it. */
export interface ActivityEntry {
  id: number
  timestamp: string
  action: 'create' | 'update' | 'transition'
  summary: string
  actor: { id: number; display_name: string } | null
  changes: Record<
    string,
    { before: unknown; after: unknown; before_label?: string | null; after_label?: string | null }
  >
}

/** How many entries show before "Show all". */
const SHOWN = 8

const MONEY_TOKEN = /\{money:(-?\d+(?:\.\d+)?)\}/g

/** A summary sentence, with each `{money:…}` marker in the reader's own money format. */
function sentence(text: string): ReactNode {
  const parts = text.split(MONEY_TOKEN)
  return parts.map((part, index) =>
    index % 2 === 1 ? <strong key={index} className="activity__money">{formatMoney(part)}</strong> : <Fragment key={index}>{part}</Fragment>,
  )
}

/** A stored value, as the field's own type would show it ("Rs 1,000.00", "30 Oct 2026", "Posted"). */
function shown(field: FieldSchema | undefined, value: unknown, label?: string | null): ReactNode {
  if (value === null || value === undefined || value === '') return <span className="activity__empty">empty</span>
  if (!field) return String(value)
  switch (field.type) {
    case 'currency':
      return formatMoney(String(value))
    case 'date':
      return formatDate(String(value))
    case 'boolean':
      return value === true ? 'yes' : 'no'
    case 'selection':
      return field.choices?.find((choice) => String(choice.value) === String(value))?.label ?? String(value)
    case 'many_to_one':
      return label ?? <span className="activity__empty">a record you can’t see</span>
    default: {
      const text = String(value)
      return text.length > 48 ? `${text.slice(0, 47)}…` : text
    }
  }
}

function Change({ field, change }: { field: FieldSchema | undefined; change: ActivityEntry['changes'][string] }) {
  return (
    <>
      <span className="activity__from">{shown(field, change.before, change.before_label)}</span>
      <span className="activity__arrow" aria-label="to">→</span>
      <span className="activity__to">{shown(field, change.after, change.after_label)}</span>
    </>
  )
}

function Entry({ entry, schema }: { entry: ActivityEntry; schema: Pick<ModelSchema, 'fields' | 'workflow' | 'verbose_name'> }) {
  const who = entry.actor?.display_name ?? 'Someone'
  const stateField = schema.workflow?.field
  const names = Object.keys(entry.changes).filter((name) => schema.fields[name])
  let body: ReactNode
  if (entry.summary) {
    body = sentence(entry.summary)
  } else if (entry.action === 'create') {
    body = (
      <>
        <strong>{who}</strong> created this {schema.verbose_name}
      </>
    )
  } else if (entry.action === 'transition' && stateField && entry.changes[stateField]) {
    body = (
      <>
        <strong>{who}</strong> moved <Change field={schema.fields[stateField]} change={entry.changes[stateField]} />
      </>
    )
  } else if (names.length === 0) {
    body = (
      <>
        <strong>{who}</strong> saved this {schema.verbose_name}
      </>
    )
  } else {
    body = (
      <>
        <strong>{who}</strong>{' '}
        {names.map((name, index) => (
          <Fragment key={name}>
            {index > 0 && <span className="activity__sep">; </span>}
            changed <span className="activity__field">{schema.fields[name].label}</span>{' '}
            <Change field={schema.fields[name]} change={entry.changes[name]} />
          </Fragment>
        ))}
      </>
    )
  }
  return (
    <li className="activity__entry">
      <span className="activity__dot" aria-hidden />
      <p className="activity__text">{body}</p>
      <p className="activity__meta">
        {entry.summary && entry.actor ? <span>{entry.actor.display_name} · </span> : null}
        <time dateTime={entry.timestamp} title={formatDateTime(entry.timestamp)}>
          {relativeTime(entry.timestamp)}
        </time>
      </p>
    </li>
  )
}

/**
 * A record's history as sentences: who did what, with each changed value
 * before → after in its own format, newest first. Presentational: the loader
 * below fetches; the gallery shows it with data of every shape.
 */
export function ActivityList({
  entries,
  schema,
  status = 'ready',
  message,
  onRetry,
  expanded,
  onExpand,
}: {
  entries: ActivityEntry[]
  schema: Pick<ModelSchema, 'fields' | 'workflow' | 'verbose_name'>
  status?: 'loading' | 'error' | 'ready'
  message?: string
  onRetry?: () => void
  /** Gallery: start with the whole history showing. */
  expanded?: boolean
  onExpand?: () => void
}) {
  const [all, setAll] = useState(false)
  const showAll = expanded ?? all
  const visible = showAll ? entries : entries.slice(0, SHOWN)
  return (
    <section className="activity" aria-label="Activity" data-tour="activity-trail">
      <header className="activity__head">
        <h2 className="activity__title">
          Activity
          {status === 'ready' && entries.length > 0 && <span className="activity__count">{entries.length.toLocaleString()}</span>}
        </h2>
      </header>
      {status === 'loading' && (
        <ul className="activity__list" aria-busy="true" aria-label="Loading activity">
          {[72, 55, 64].map((width) => (
            <li key={width} className="activity__entry">
              <span className="activity__dot" aria-hidden />
              <Skeleton className="h-3" style={{ width: `${width}%` }} />
              <Skeleton className="mt-[var(--space-2)] h-3 w-16" />
            </li>
          ))}
        </ul>
      )}
      {status === 'error' && (
        <div className="activity__error" role="alert">
          <CloudOff className="size-4" aria-hidden />
          <span>{message ?? 'Couldn’t load the activity.'}</span>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="h-[var(--control-height-sm)] text-[length:var(--text-sm)]">
              Try again
            </Button>
          )}
        </div>
      )}
      {status === 'ready' && entries.length === 0 && (
        <p className="activity__none">Nothing has happened to this {schema.verbose_name} yet.</p>
      )}
      {status === 'ready' && entries.length > 0 && (
        <ul className="activity__list">
          {visible.map((entry) => (
            <Entry key={entry.id} entry={entry} schema={schema} />
          ))}
        </ul>
      )}
      {status === 'ready' && entries.length > SHOWN && !showAll && (
        <button
          type="button"
          className={cn('activity__more')}
          onClick={() => {
            setAll(true)
            onExpand?.()
          }}
        >
          Show all {entries.length.toLocaleString()}
        </button>
      )}
    </section>
  )
}

/** Fetches a saved record's history and shows it. `version` changes when the record does, to refetch. */
export function ActivityTrail({
  appLabel,
  model,
  recordId,
  schema,
  version,
}: {
  appLabel: string
  model: string
  recordId: number
  schema: Pick<ModelSchema, 'fields' | 'workflow' | 'verbose_name'>
  version?: string
}) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; entries: ActivityEntry[] }
  >({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    apiGet<{ results: ActivityEntry[] }>(`/data/${appLabel}/${model}/${recordId}/history/`)
      .then((response) => current && setState({ status: 'ready', entries: response.results }))
      .catch((error: unknown) => {
        if (current) {
          setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Could not reach the API.' })
        }
      })
    return () => {
      current = false
    }
  }, [appLabel, model, recordId, version, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return (
    <ActivityList
      schema={schema}
      status={state.status}
      entries={state.status === 'ready' ? state.entries : []}
      message={state.status === 'error' ? state.message : undefined}
      onRetry={retry}
    />
  )
}
