import { useEffect } from 'react'
import { useAuth } from './authContext'
import { safeNext } from './redirects'
import { SignInForm } from './SignInForm'
import './auth.css'

export function LoginScreen() {
  const { login } = useAuth()
  const next = safeNext(new URLSearchParams(window.location.search).get('next'))

  useEffect(() => {
    document.title = 'Sign in · Clicker'
  }, [])

  return (
    <main className="login-page">
      <div className="login-card">
        <h1 className="login-card__title">Sign in to Clicker</h1>
        <SignInForm
          onSubmit={async (username, password) => {
            await login(username, password)
            // Back to wherever the user was headed before being sent here.
            window.location.replace(next)
          }}
        />
      </div>
    </main>
  )
}
