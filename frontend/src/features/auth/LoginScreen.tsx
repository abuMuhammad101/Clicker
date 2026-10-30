import { useCallback, useEffect, useState } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiUrl } from '@/lib/api'
import { useAuth } from './authContext'
import { safeNext } from './redirects'
import { SignInForm } from './SignInForm'
import './auth.css'

/** One way to sign in, as GET /api/auth/providers/ lists it. */
interface Provider {
  id: string
  label: string
}

type ProvidersState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; providers: Provider[] }

/**
 * The sign-in screen, drawn from the providers the backend offers. Today that
 * is only "password"; a single sign-on provider added on the backend shows up
 * here as a button with no change to this screen.
 */
export function LoginScreen() {
  const { login } = useAuth()
  const next = safeNext(new URLSearchParams(window.location.search).get('next'))
  const [state, setState] = useState<ProvidersState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    document.title = 'Sign in · Clicker'
  }, [])

  useEffect(() => {
    let cancelled = false
    apiGet<{ providers: Provider[] }>('/auth/providers/', { probe: true })
      .then(({ providers }) => !cancelled && setState({ status: 'ready', providers }))
      .catch(() => !cancelled && setState({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const password = state.status === 'ready' && state.providers.some((p) => p.id === 'password')
  const others = state.status === 'ready' ? state.providers.filter((p) => p.id !== 'password') : []

  return (
    <main className="login-page">
      <div className="login-brand">
        <BrandMark size={24} />
        <span className="login-brand__name">Clicker</span>
      </div>
      <div className="login-card">
        <h1 className="login-card__title">Sign in</h1>

        {state.status === 'loading' && (
          <div className="login-card__loading" aria-busy="true">
            <Skeleton className="h-[var(--control-height)] w-full" />
            <Skeleton className="h-[var(--control-height)] w-full" />
          </div>
        )}

        {state.status === 'error' && (
          <div className="login-card__error" role="alert">
            <p>Can’t reach the server. Check your connection and try again.</p>
            <Button variant="outline" onClick={retry} className="h-[var(--control-height)]">
              Try again
            </Button>
          </div>
        )}

        {others.length > 0 && (
          <div className="login-card__providers">
            {others.map((provider) => (
              <Button key={provider.id} asChild variant="outline" className="h-[var(--control-height)] w-full">
                <a href={apiUrl(`/auth/${encodeURIComponent(provider.id)}/start/?next=${encodeURIComponent(next)}`)}>
                  Continue with {provider.label}
                </a>
              </Button>
            ))}
            {password && <p className="login-card__or">or</p>}
          </div>
        )}

        {password && (
          <SignInForm
            onSubmit={async (username, password) => {
              await login(username, password)
              // Back to wherever the user was headed before being sent here.
              window.location.replace(next)
            }}
          />
        )}
      </div>
    </main>
  )
}
