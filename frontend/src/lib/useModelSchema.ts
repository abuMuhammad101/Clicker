import { useEffect, useState } from 'react'
import { apiGet, ApiError } from '@/lib/api'
import type { ModelSchema } from '@/types/schema'

type State =
  | { status: 'loading' }
  /** `notFound`: the model doesn't exist for this user (a 404). Nothing to retry. */
  | { status: 'error'; message: string; notFound: boolean }
  | { status: 'ready'; schema: ModelSchema }

export function useModelSchema(appLabel: string, modelName: string): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })

    apiGet<ModelSchema>(`/schema/${appLabel}/${modelName}/`)
      .then((schema) => {
        if (!cancelled) setState({ status: 'ready', schema })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof ApiError ? error.message : 'Could not reach the API.'
        setState({ status: 'error', message, notFound: error instanceof ApiError && error.status === 404 })
      })

    return () => {
      cancelled = true
    }
  }, [appLabel, modelName])

  return state
}
