import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiSend } from '@/lib/api'

/**
 * A per-user preference kept on the server, so it follows the person to
 * another browser or machine. Reads once, writes on change.
 *
 * It is a convenience, never a dependency: until the read arrives, and if
 * either request fails, the UI uses `fallback` and keeps working. A change is
 * applied immediately and saved behind it; a change made before the read
 * lands wins over it.
 */
export function usePreference<T>(key: string, fallback: T) {
  const [ready, setReady] = useState(false)
  const [value, setValue] = useState<T>(fallback)
  const current = useRef<T>(fallback)
  const changed = useRef(false)

  useEffect(() => {
    let cancelled = false
    const settle = (loaded: T | null) => {
      if (cancelled) return
      if (!changed.current && loaded != null) {
        current.current = loaded
        setValue(loaded)
      }
      setReady(true)
    }
    apiGet<{ value: T | null }>(`/preferences/${key}/`)
      .then(({ value: loaded }) => settle(loaded))
      .catch(() => settle(null))
    return () => {
      cancelled = true
    }
  }, [key])

  const set = useCallback(
    (update: T | ((previous: T) => T)) => {
      const next = typeof update === 'function' ? (update as (p: T) => T)(current.current) : update
      changed.current = true
      current.current = next
      setValue(next)
      void apiSend('PUT', `/preferences/${key}/`, { value: next }).catch(() => {
        // Not saved; it still holds for this page load.
      })
    },
    [key],
  )

  return { value, ready, set }
}
