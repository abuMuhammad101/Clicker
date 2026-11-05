import { useCallback, useEffect, useState } from 'react'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { apiGet, apiUrl } from '@/lib/api'
import { useAuth } from './authContext'
import { safeNext, takeSignedOut } from './redirects'
import { ProofStrip, type ProofCard } from './ProofStrip'
import { SignInForm } from './SignInForm'
import './auth.css'

/** One way to sign in, as GET /api/auth/providers/ lists it. */
interface Provider {
  id: string
  label: string
}

/** What the public providers endpoint says about the organisation. */
interface Organisation {
  name: string
  promise: string
  login_proof?: ProofCard[]
}

type ProvidersState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; providers: Provider[]; organisation?: Organisation }

/**
 * The sign-in screen, drawn from the providers the backend offers. Today that
 * is only "password"; a single sign-on provider added on the backend shows up
 * here as a button with no change to this screen.
 */
export function LoginScreen() {
  const { authenticate } = useAuth()
  const next = safeNext(new URLSearchParams(window.location.search).get('next'))
  const [state, setState] = useState<ProvidersState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // Said once: you chose to leave, or the session ran out. Neither blames you.
  const [notice] = useState<string | null>(() =>
    takeSignedOut()
      ? 'You’ve been signed out.'
      : new URLSearchParams(window.location.search).get('reason') === 'expired'
        ? 'You were signed out after a period of no activity. Sign in to pick up where you left off.'
        : null,
  )

  useEffect(() => {
    document.title = 'Sign in · Clicker'
  }, [])

  useEffect(() => {
    let cancelled = false
    apiGet<{ providers: Provider[]; organisation?: Organisation }>('/auth/providers/', { probe: true })
      .then(({ providers, organisation }) => !cancelled && setState({ status: 'ready', providers, organisation }))
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
  const organisation = state.status === 'ready' ? state.organisation : undefined
  const headline = organisation?.promise
  const proof = organisation?.login_proof ?? []

  return (
    <main className="login-page">
      <div className="login-brand">
        <BrandMark size={24} />
        <span className="login-brand__name">Clicker</span>
      </div>

      {/* The organisation's promise, from the organisation setting. Right of the form from 1024px; above it below. */}
      <section className="login-panel">
        <div className="login-panel__inner">
          {headline ? (
            <h1 className="login-panel__headline">{headline}</h1>
          ) : (
            <>
              <h1 className="sr-only">Welcome to Clicker</h1>
              {state.status === 'loading' && (
                <div className="login-panel__skeleton" aria-hidden="true">
                  <Skeleton className="h-[var(--text-display)] w-4/5" />
                  <Skeleton className="h-[var(--text-display)] w-3/5" />
                </div>
              )}
            </>
          )}
          {proof.length > 0 && <ProofStrip cards={proof} />}
        </div>
      </section>

      <div className="login-card">
        <h2 className="login-card__title">Sign in</h2>
        {organisation?.name && <p className="login-card__org">{organisation.name}</p>}
        {notice && (
          <p className="login-card__notice" role="status">
            {notice}
          </p>
        )}

        {state.status === 'loading' && (
          <div className="login-card__loading" aria-busy="true">
            <Skeleton className="h-[var(--control-height)] w-full" />
            <Skeleton className="h-[var(--control-height)] w-full" />
          </div>
        )}

        {state.status === 'error' && (
          <div className="login-card__error" role="alert">
            <p>Can’t reach Clicker. Check your connection and try again.</p>
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
            // The server answers with where to go, having checked it again; if it says nothing, Home.
            onSubmit={(username, pass) => authenticate(username, pass, next)}
            onSigned={(destination) => window.location.replace(safeNext(destination as string | null))}
          />
        )}
      </div>

      <details className="login-help">
        <summary>Need help signing in?</summary>
        <p>Ask your administrator to reset your password.</p>
      </details>
    </main>
  )
}
