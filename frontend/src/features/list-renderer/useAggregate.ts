import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/api'
import type { GroupHeader, Summary } from '@/lib/listQuery'
import { errorMessage } from './useRecordWindow'

type State =
  | { status: 'idle' }
  | { status: 'loading'; previous: { summaries: Summary[]; groups: GroupHeader[] | null } | null }
  | { status: 'error'; message: string }
  | { status: 'ready'; summaries: Summary[]; groups: GroupHeader[] | null }

/**
 * The summaries and, when grouped, the group headers for the rows a list
 * shows: one request to the aggregate endpoint, with the same filters and
 * search as the rows. While a new answer is on its way the previous one
 * stays available, so the strip doesn't blink to empty on every keystroke.
 */
export function useAggregate(appLabel: string, model: string, query: string, groupBy: string | null, enabled: boolean) {
  const [state, setState] = useState<State>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  const generation = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' })
      return
    }
    const gen = ++generation.current
    setState((current) => ({
      status: 'loading',
      previous: current.status === 'ready' ? { summaries: current.summaries, groups: current.groups } : null,
    }))
    const search = new URLSearchParams(query)
    if (groupBy) search.set('group_by', groupBy)
    apiGet<{ summaries: Summary[]; groups: GroupHeader[] | null }>(`/data/${appLabel}/${model}/aggregate/?${search}`)
      .then((response) => {
        if (generation.current === gen) setState({ status: 'ready', ...response })
      })
      .catch((error: unknown) => {
        if (generation.current === gen) setState({ status: 'error', message: errorMessage(error) })
      })
  }, [appLabel, model, query, groupBy, enabled, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}
