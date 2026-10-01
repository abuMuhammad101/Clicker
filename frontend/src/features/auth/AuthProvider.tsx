import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiGet, apiSend, ApiError, onUnauthorized, setCsrfToken } from '@/lib/api'
import { AuthContext, type AuthState, type User } from './authContext'

interface SessionResponse {
  user: User
  csrf_token: string
}

async function fetchCsrfToken() {
  const { csrf_token } = await apiGet<{ csrf_token: string }>('/auth/csrf/', { probe: true })
  setCsrfToken(csrf_token)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'checking' })
  const [attempt, setAttempt] = useState(0)

  // Who is this? Asked once per page load.
  useEffect(() => {
    let cancelled = false
    apiGet<SessionResponse>('/auth/me/', { probe: true })
      .then(({ user, csrf_token }) => {
        if (cancelled) return
        setCsrfToken(csrf_token)
        setState({ status: 'authenticated', user, expired: false })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: 'anonymous' })
          return
        }
        setState({ status: 'unreachable', message: 'Could not reach the server.' })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Any 401 after sign-in means the session ended underneath this page.
  useEffect(
    () =>
      onUnauthorized(() =>
        setState((current) =>
          current.status === 'authenticated' ? { ...current, expired: true } : current,
        ),
      ),
    [],
  )

  const login = useCallback(async (username: string, password: string) => {
    // A token issued for the old session is no good after it ended; a fresh
    // one is cheap and makes the login POST independent of what came before.
    await fetchCsrfToken()
    const { user, csrf_token } = await apiSend<SessionResponse>('POST', '/auth/login/', {
      username,
      password,
    })
    setCsrfToken(csrf_token)
    setState({ status: 'authenticated', user, expired: false })
  }, [])

  const logout = useCallback(async (then: string) => {
    // A session that already ended is as logged out as it gets; a failed
    // logout request must never leave the user stuck signed in on screen.
    await apiSend('POST', '/auth/logout/').catch(() => undefined)
    setCsrfToken(null)
    // Navigate rather than flip state to anonymous: the page is going away
    // anyway, and an anonymous state would race this navigation with the
    // app's own "send anonymous users to login" redirect.
    window.location.assign(then)
  }, [])

  const retry = useCallback(() => {
    setState({ status: 'checking' })
    setAttempt((n) => n + 1)
  }, [])

  const value = useMemo(() => ({ state, login, logout, retry }), [state, login, logout, retry])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
