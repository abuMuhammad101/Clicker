import { useEffect, useRef, useState } from 'react'
import { apiGet } from '@/lib/api'

export interface Option {
  value: number
  label: string
}

/**
 * Debounced async search against the schema-driven /api/data/.../search/
 * endpoint. Only fires while `enabled` (the picker is open) — no point
 * hitting the backend for a field the user hasn't opened yet.
 */
export function useManyToOneSearch(
  target: { app_label: string; model: string },
  domain: Record<string, string> | undefined,
  query: string,
  enabled: boolean,
) {
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)
  const domainKey = domain ? JSON.stringify(domain) : ''

  useEffect(() => {
    if (!enabled) return

    const id = ++requestId.current
    setLoading(true)

    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (domain) {
      for (const [key, value] of Object.entries(domain)) {
        params.set(key, value)
      }
    }

    const timeout = setTimeout(() => {
      apiGet<Option[]>(`/data/${target.app_label}/${target.model}/search/?${params.toString()}`)
        .then((results) => {
          if (requestId.current === id) {
            setOptions(results)
            setLoading(false)
          }
        })
        .catch(() => {
          if (requestId.current === id) {
            setOptions([])
            setLoading(false)
          }
        })
    }, 200)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.app_label, target.model, domainKey, query, enabled])

  return { options, loading }
}
