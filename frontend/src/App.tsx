import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from './features/auth/authContext'
import { LoginScreen } from './features/auth/LoginScreen'
import { loginUrl, safeNext } from './features/auth/redirects'
import { SessionExpiredDialog } from './features/auth/SessionExpiredDialog'
import './features/auth/auth.css'
import { useLocation } from './lib/router'
import { AppShell } from './shell/AppShell'

/**
 * The auth gate. Every route except /login requires a session; an
 * anonymous visitor is sent to /login?next=<where they were going> and
 * returned there after signing in. Everything signed-in lives inside
 * AppShell, which owns the routes. A session that ends mid-page doesn't
 * navigate anywhere: the shell stays mounted and SessionExpiredDialog asks
 * for the password on top.
 */
function App() {
  const { state, retry } = useAuth()
  const { pathname, search } = useLocation()

  if (state.status === 'checking') return <div className="boot-screen" aria-busy="true" />
  if (state.status === 'unreachable') {
    return (
      <div className="boot-screen boot-screen--error" role="alert">
        <h1 className="boot-screen__title">Clicker can’t reach its server</h1>
        <p className="boot-screen__message">{state.message}</p>
        <Button variant="outline" onClick={retry} className="h-[var(--control-height)]">
          Try again
        </Button>
      </div>
    )
  }

  if (pathname === '/login') {
    if (state.status === 'authenticated') {
      return <Redirect to={safeNext(new URLSearchParams(search).get('next'))} />
    }
    return <LoginScreen />
  }

  if (state.status === 'anonymous') return <Redirect to={loginUrl(pathname + search)} />

  return (
    <>
      <AppShell user={state.user} />
      {state.expired && <SessionExpiredDialog user={state.user} />}
    </>
  )
}

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to)
  }, [to])
  return <div className="boot-screen" />
}

export default App
