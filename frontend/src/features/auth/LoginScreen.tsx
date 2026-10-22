import { useEffect } from 'react'
import { BrandMark } from '@/components/BrandMark'
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
      <div className="login-brand">
        <BrandMark size={24} />
        <span className="login-brand__name">Clicker</span>
      </div>
      <div className="login-card">
        <h1 className="login-card__title">Sign in</h1>
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
