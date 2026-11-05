import { Check, CircleAlert, Eye, EyeOff } from 'lucide-react'
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
  onSubmit: (username: string, password: string) => Promise<unknown>
  /**
   * Called with what `onSubmit` returned once the button has shown its check (the slow motion token; straight away
   * under reduced motion). The sign-in screen leaves from here; the session-expired dialog doesn't pass it.
   */
  onSigned?: (result: unknown) => void
  /** Rendered beside the submit button, e.g. "Sign in as someone else". */
  secondaryAction?: ReactNode
}

/**
 * Username + password, composed from the registry's own pieces: TextField
 * for the username, and FieldShell around a password-type Input for the
 * password. Password is not a registry type — no model stores one — so it
 * gets the field chrome without becoming a field component.
 */
/** The slow motion token, in milliseconds; zero when the person asked for less motion. */
function successHold(): number {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-slow').trim()
  const value = parseFloat(raw)
  if (Number.isNaN(value)) return 0
  return raw.endsWith('ms') ? value : value * 1000
}

export function SignInForm({ fixedUsername, onSubmit, onSigned, secondaryAction }: SignInFormProps) {
  const [username, setUsername] = useState(fixedUsername ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const passwordId = useId()
  const formRef = useRef<HTMLFormElement>(null)

  // Focus the first thing to type into: the username, or straight to the
  // password when the account is already known.
  useEffect(() => {
    const target = fixedUsername
      ? formRef.current?.querySelector<HTMLInputElement>('input[name="password"]')
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
    let leaving = false
    try {
      const result = await onSubmit(username.trim(), password)
      if (onSigned) {
        // Success: the button turns to a check for the slow token, then the app loads. No morph under reduced motion.
        const hold = successHold()
        if (hold > 0) {
          setSignedIn(true)
          await new Promise((resolve) => window.setTimeout(resolve, hold))
        }
        leaving = true
        onSigned(result)
        return
      }
    } catch (caught) {
      setPassword('')
      setError(
        // 400: wrong credentials. 429: too many failed attempts, locked for a while.
        caught instanceof ApiError && (caught.status === 400 || caught.status === 429)
          ? caught.message
          : 'Can’t reach Clicker. Check your connection and try again.',
      )
    } finally {
      // Once leaving, the button stays as it is until the page goes.
      if (!leaving) setSubmitting(false)
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
          <CircleAlert className="sign-in-form__error-icon" aria-hidden="true" />
          {error}
        </p>
      )}
      <div className="sign-in-form__fields">
        <TextField
          name="username"
          label="Username"
          placeholder=""
          value={username || null}
          onChange={(value) => setUsername(value ?? '')}
          readOnly={!!fixedUsername}
        />
        <FieldShell label="Password" htmlFor={passwordId}>
          <div className="sign-in-form__password">
            <Input
              id={passwordId}
              name="password"
              type={reveal ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => setCapsLock(event.getModifierState('CapsLock'))}
              onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
              onBlur={() => setCapsLock(false)}
              aria-describedby={capsLock ? `${passwordId}-caps` : undefined}
            />
            <button
              type="button"
              className="sign-in-form__reveal"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? 'Hide password' : 'Show password'}
              aria-pressed={reveal}
            >
              {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </button>
          </div>
        </FieldShell>
        {capsLock && (
          <p id={`${passwordId}-caps`} className="sign-in-form__caps" role="status">
            Caps Lock is on.
          </p>
        )}
      </div>
      <div className="sign-in-form__actions">
        {secondaryAction}
        <Button
          type="submit"
          disabled={submitting}
          data-state={signedIn ? 'signed-in' : submitting ? 'submitting' : 'idle'}
          className="sign-in-form__submit h-[var(--control-height)]"
        >
          {signedIn ? (
            <>
              <Check className="sign-in-form__check" aria-hidden />
              <span className="sr-only">Signed in</span>
            </>
          ) : submitting ? (
            'Signing in…'
          ) : (
            'Sign in'
          )}
        </Button>
      </div>
    </form>
  )
}
