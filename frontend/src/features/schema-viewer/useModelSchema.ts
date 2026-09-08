import { useEffect, useState } from 'react'
import { apiGet, ApiError } from '../../lib/api'
import type { ModelSchema } from '../../types/schema'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
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
        setState({ status: 'error', message })
      })

    return () => {
      cancelled = true
    }
  }, [appLabel, modelName])

  return state
}
