import { useEffect, useRef } from 'react'
import type { RecordEnvelope } from '@/types/record'
import type { ModelRef } from './paths'

/**
 * "This record was saved." Anything that saves a record says so here; anything
 * that is showing records (a list, a form with a relation to it) listens.
 * Neither side knows the other exists, which is what lets a record be edited
 * in a peek while the list behind it stays current, and what will let a tab
 * bar or a split pane do the same with no change to either renderer.
 *
 * This replaces the "stale views" open problem the surfaces contract logged.
 */
export interface RecordChange {
  model: ModelRef
  record: RecordEnvelope
}

type Listener = (change: RecordChange) => void
const listeners = new Set<Listener>()

export function emitRecordChanged(model: ModelRef, record: RecordEnvelope) {
  const change: RecordChange = { model: { app_label: model.app_label, model: model.model }, record }
  listeners.forEach((listener) => listener(change))
}

/** Listen for as long as the calling component is mounted. */
export function useRecordChanged(handler: Listener) {
  // Always call the latest handler without re-subscribing.
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => {
    const listener: Listener = (change) => latest.current(change)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
}
