import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet } from '@/lib/api'
import type { GroupHeader } from '@/lib/listQuery'
import type { RecordEnvelope } from '@/types/record'
import { errorMessage, PAGE_SIZE, type ListResponse } from './useRecordWindow'

/** One line of a grouped list: a group's header, or one of its rows. */
export type GroupedItem =
  | { kind: 'group'; group: GroupHeader }
  | { kind: 'row'; group: GroupHeader; rowIndex: number; record: RecordEnvelope | null }

interface Segment {
  group: GroupHeader
  /** Index of the header in the flat list; its rows follow it. */
  start: number
  rows: number
}

/**
 * A grouped list in the same windowed model as an ungrouped one. The group
 * headers (count and sums, from one aggregate query) arrive first and fix
 * the list's height; each expanded group's rows are then fetched in pages
 * of 100, through the ordinary list endpoint with the group's own filter,
 * only as the viewport reaches them. A collapsed group is one line and
 * fetches nothing.
 */
export function useGroupedWindow(
  appLabel: string,
  model: string,
  ordering: string,
  query: string,
  groups: GroupHeader[] | null,
  collapsed: string[],
) {
  const [pages, setPages] = useState<Record<string, Record<number, RecordEnvelope[]>>>({})
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const inFlight = useRef(new Set<string>())

  const basePath = `/data/${appLabel}/${model}/`
  const params = useCallback(
    (filter: string, page: number) => {
      const search = new URLSearchParams(query)
      search.append('filter', filter)
      search.set('ordering', ordering)
      search.set('limit', String(PAGE_SIZE))
      search.set('offset', String(page * PAGE_SIZE))
      return `${basePath}?${search.toString()}`
    },
    [basePath, ordering, query],
  )

  // New groups or a new sort: every fetched page is stale.
  useEffect(() => {
    generation.current++
    inFlight.current = new Set()
    setPages({})
    setError(null)
  }, [groups, params])

  const segments = useMemo<Segment[]>(
    () =>
      (groups ?? []).reduce<Segment[]>((list, group) => {
        const previous = list[list.length - 1]
        const start = previous ? previous.start + 1 + previous.rows : 0
        const open = group.filter !== null && !collapsed.includes(group.key)
        return [...list, { group, start, rows: open ? group.count : 0 }]
      }, []),
    [groups, collapsed],
  )

  const total = segments.length ? segments[segments.length - 1].start + 1 + segments[segments.length - 1].rows : 0

  const segmentAt = useCallback(
    (index: number) => {
      let low = 0
      let high = segments.length - 1
      while (low < high) {
        const mid = (low + high + 1) >> 1
        if (segments[mid].start <= index) low = mid
        else high = mid - 1
      }
      return segments[low]
    },
    [segments],
  )

  const itemAt = useCallback(
    (index: number): GroupedItem | null => {
      if (index < 0 || index >= total) return null
      const segment = segmentAt(index)
      if (index === segment.start) return { kind: 'group', group: segment.group }
      const rowIndex = index - segment.start - 1
      const record = pages[segment.group.key]?.[Math.floor(rowIndex / PAGE_SIZE)]?.[rowIndex % PAGE_SIZE] ?? null
      return { kind: 'row', group: segment.group, rowIndex, record }
    },
    [segmentAt, pages, total],
  )

  const ensureRange = useCallback(
    (start: number, end: number) => {
      const gen = generation.current
      for (const segment of segments) {
        if (!segment.rows || segment.group.filter === null) continue
        const rowsFrom = Math.max(start, segment.start + 1) - segment.start - 1
        const rowsTo = Math.min(end, segment.start + segment.rows) - segment.start - 1
        if (rowsTo < rowsFrom) continue
        const key = segment.group.key
        const filter = segment.group.filter
        for (let page = Math.floor(rowsFrom / PAGE_SIZE); page <= Math.floor(rowsTo / PAGE_SIZE); page++) {
          const flight = `${key}\u0000${page}`
          if (pages[key]?.[page] || inFlight.current.has(flight)) continue
          inFlight.current.add(flight)
          apiGet<ListResponse>(params(filter, page))
            .then((response) => {
              if (generation.current !== gen) return
              inFlight.current.delete(flight)
              setPages((current) => ({ ...current, [key]: { ...current[key], [page]: response.results } }))
            })
            .catch((failure: unknown) => {
              if (generation.current !== gen) return
              setError(errorMessage(failure))
            })
        }
      }
    },
    [segments, pages, params],
  )

  const getRecord = useCallback((index: number) => {
    const item = itemAt(index)
    return item?.kind === 'row' ? item.record : null
  }, [itemAt])

  const updateRow = useCallback(
    (index: number, record: RecordEnvelope) => {
      const item = itemAt(index)
      if (item?.kind !== 'row') return
      const key = item.group.key
      const page = Math.floor(item.rowIndex / PAGE_SIZE)
      setPages((current) => {
        const rows = current[key]?.[page]
        if (!rows) return current
        const next = rows.slice()
        next[item.rowIndex % PAGE_SIZE] = record
        return { ...current, [key]: { ...current[key], [page]: next } }
      })
    },
    [itemAt],
  )

  const replaceRecord = useCallback((record: RecordEnvelope) => {
    setPages((current) => {
      for (const [key, byPage] of Object.entries(current)) {
        for (const [page, rows] of Object.entries(byPage)) {
          const at = rows.findIndex((row) => row.id === record.id)
          if (at === -1) continue
          const next = rows.slice()
          next[at] = record
          return { ...current, [key]: { ...byPage, [Number(page)]: next } }
        }
      }
      return current
    })
  }, [])

  const hasRecord = useCallback(
    (id: number) =>
      Object.values(pages).some((byPage) => Object.values(byPage).some((rows) => rows.some((row) => row.id === id))),
    [pages],
  )

  return { total, itemAt, getRecord, ensureRange, updateRow, replaceRecord, hasRecord, error }
}
