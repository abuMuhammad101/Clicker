import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldShell } from '@/fields/shared/FieldShell'
import { TextField } from '@/fields/text/TextField'
import { ApiError } from '@/lib/api'
import './auth.css'

interface SignInFormProps {
  /** Re-authenticating an expired session: the account is fixed. */
  fixedUsername?: string
  onSubmit: (username: string, password: string) => Promise<void>
  /** Rendered beside the submit button, e.g. "Sign in as someone else". */
  secondaryAction?: ReactNode
}

/**
 * Username + password, composed from the registry's own pieces: TextField
 * for the username, and FieldShell around a password-type Input for the
 * password. Password is not a registry type — no model stores one — so it
 * gets the field chrome without becoming a field component.
 */
export function SignInForm({ fixedUsername, onSubmit, secondaryAction }: SignInFormProps) {
  const [username, setUsername] = useState(fixedUsername ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const passwordId = useId()
  const formRef = useRef<HTMLFormElement>(null)

  // Focus the first thing to type into: the username, or straight to the
  // password when the account is already known.
  useEffect(() => {
    const target = fixedUsername
      ? formRef.current?.querySelector<HTMLInputElement>('input[type="password"]')
      : formRef.current?.querySelector<HTMLInputElement>('input')
    target?.focus()
  }, [fixedUsername])

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(username.trim(), password)
    } catch (caught) {
      setPassword('')
      setError(
        caught instanceof ApiError && caught.status === 400
          ? caught.message
          : 'Could not reach the server. Check your connection and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      ref={formRef}
      className="sign-in-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      noValidate
    >
      {error && (
        <p className="sign-in-form__error" role="alert">
          {error}
        </p>
      )}
      <div className="sign-in-form__fields">
        <TextField
          name="username"
          label="Username"
          value={username || null}
          onChange={(value) => setUsername(value ?? '')}
          readOnly={!!fixedUsername}
        />
        <FieldShell label="Password" htmlFor={passwordId}>
          <Input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FieldShell>
      </div>
      <div className="sign-in-form__actions">
        {secondaryAction}
        <Button type="submit" disabled={submitting} className="h-[var(--control-height)]">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </form>
  )
}
