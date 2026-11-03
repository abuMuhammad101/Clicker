import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, ApiError } from '@/lib/api'
import type { RecordEnvelope } from '@/types/record'

export const PAGE_SIZE = 100

export interface ListResponse {
  count: number
  results: RecordEnvelope[]
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; total: number; pages: Record<number, RecordEnvelope[]> }

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.validation ? Object.values(error.validation).flat().join(' ') : error.message
  return 'Could not reach the API.'
}

/**
 * Windowed access to a server-side list. The first page establishes the
 * total, so the scroll area is the list's true height from the start; after
 * that, only the pages the viewport actually reaches are fetched, in any
 * order — dragging the scrollbar to row 4,000 fetches the page holding row
 * 4,000, not the 39 pages before it.
 *
 * Any change to ordering or query starts over from nothing: pages fetched
 * under one sort are meaningless under another.
 */
export function useRecordWindow(
  appLabel: string,
  model: string,
  ordering: string,
  /** Filters and search, as a query string (`filter=…&q=…`); see `baseParams`. */
  query: string,
  enabled = true,
) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // Bumped on every reset; a response from an older generation is dropped.
  const generation = useRef(0)
  const inFlight = useRef(new Set<number>())

  const basePath = `/data/${appLabel}/${model}/`
  const params = useCallback(
    (page: number) => {
      const search = new URLSearchParams(query)
      search.set('ordering', ordering)
      search.set('limit', String(PAGE_SIZE))
      search.set('offset', String(page * PAGE_SIZE))
      return `${basePath}?${search.toString()}`
    },
    [basePath, ordering, query],
  )

  useEffect(() => {
    if (!enabled) return
    const gen = ++generation.current
    inFlight.current = new Set([0])
    setState({ status: 'loading' })

    apiGet<ListResponse>(params(0))
      .then((response) => {
        if (generation.current !== gen) return
        inFlight.current.delete(0)
        setState({ status: 'ready', total: response.count, pages: { 0: response.results } })
      })
      .catch((error: unknown) => {
        if (generation.current !== gen) return
        setState({ status: 'error', message: errorMessage(error) })
      })
  }, [params, attempt, enabled])

  /** Fetch whatever pages cover rows [start, end] that aren't loaded yet. */
  const ensureRange = useCallback(
    (start: number, end: number) => {
      if (state.status !== 'ready') return
      const gen = generation.current
      const first = Math.floor(start / PAGE_SIZE)
      const last = Math.floor(Math.min(end, state.total - 1) / PAGE_SIZE)

      for (let page = first; page <= last; page++) {
        if (state.pages[page] || inFlight.current.has(page)) continue
        inFlight.current.add(page)
        apiGet<ListResponse>(params(page))
          .then((response) => {
            if (generation.current !== gen) return
            inFlight.current.delete(page)
            setState((current) =>
              current.status === 'ready'
                ? { ...current, total: response.count, pages: { ...current.pages, [page]: response.results } }
                : current,
            )
          })
          .catch((error: unknown) => {
            if (generation.current !== gen) return
            setState({ status: 'error', message: errorMessage(error) })
          })
      }
    },
    [state, params],
  )

  const getRow = useCallback(
    (index: number): RecordEnvelope | null => {
      if (state.status !== 'ready') return null
      return state.pages[Math.floor(index / PAGE_SIZE)]?.[index % PAGE_SIZE] ?? null
    },
    [state],
  )

  /** Swap one loaded row for a new version of the same record (an edit, or its rollback). */
  const updateRow = useCallback((index: number, record: RecordEnvelope) => {
    setState((current) => {
      if (current.status !== 'ready') return current
      const page = Math.floor(index / PAGE_SIZE)
      const rows = current.pages[page]
      if (!rows) return current
      const next = rows.slice()
      next[index % PAGE_SIZE] = record
      return { ...current, pages: { ...current.pages, [page]: next } }
    })
  }, [])

  /** A record was saved somewhere else: refresh it here if this list has it loaded. */
  const replaceRecord = useCallback((record: RecordEnvelope) => {
    setState((current) => {
      if (current.status !== 'ready') return current
      for (const [page, rows] of Object.entries(current.pages)) {
        const at = rows.findIndex((row) => row.id === record.id)
        if (at === -1) continue
        const next = rows.slice()
        next[at] = record
        return { ...current, pages: { ...current.pages, [Number(page)]: next } }
      }
      return current
    })
  }, [])

  const hasRecord = useCallback(
    (id: number) => state.status === 'ready' && Object.values(state.pages).some((rows) => rows.some((row) => row.id === id)),
    [state],
  )

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { state, getRow, ensureRange, updateRow, replaceRecord, hasRecord, retry }
}
