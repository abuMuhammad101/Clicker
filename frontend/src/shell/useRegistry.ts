import { useCallback, useEffect, useState } from 'react'
import { apiGet, ApiError } from '@/lib/api'

/** Mirrors backend/schema/engine.py's build_registry(). */
export interface RegistryModel {
  model: string
  label: string
  label_singular: string
  route: string
}

export interface RegistryApp {
  app_label: string
  label: string
  models: RegistryModel[]
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; apps: RegistryApp[] }

/** What modules and models exist. Fetched once per page load, by the shell. */
export function useRegistry() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    apiGet<{ apps: RegistryApp[] }>('/registry/')
      .then(({ apps }) => !cancelled && setState({ status: 'ready', apps }))
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof ApiError ? error.message : 'Could not reach the API.'
        setState({ status: 'error', message })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  return { state, retry }
}

/** The registry entries a path belongs to, if any. */
export function findInRegistry(apps: RegistryApp[], appLabel: string, model: string) {
  const app = apps.find((entry) => entry.app_label === appLabel)
  const found = app?.models.find((entry) => entry.model === model)
  return app && found ? { app, model: found } : null
}
