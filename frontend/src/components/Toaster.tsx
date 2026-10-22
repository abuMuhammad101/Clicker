import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Info } from 'lucide-react'
import { dismissToast, useToasts, type ToastItem, type ToastKind } from '@/lib/toast'
import './Toaster.css'

const ICONS: Record<ToastKind, typeof Check> = {
  success: Check,
  error: CircleAlert,
  info: Info,
}

/**
 * Bottom-centre stack of dark pills: an icon, one short sentence, and at most
 * one action. Drawn once, by the shell. A toast pauses while it is hovered or
 * focused, so there is time to read it or press Undo.
 */
export function Toaster() {
  const toasts = useToasts()
  return (
    <div className="toaster" role="region" aria-label="Notifications">
      {toasts.map((item) => (
        <ToastView key={item.id} item={item} />
      ))}
    </div>
  )
}

function ToastView({ item }: { item: ToastItem }) {
  const Icon = ICONS[item.kind]
  const [paused, setPaused] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const remaining = useRef(item.duration)
  const startedAt = useRef(0)

  // Count down while not paused; keep what's left across pauses.
  useEffect(() => {
    if (paused || leaving) return
    startedAt.current = Date.now()
    const timeout = setTimeout(() => setLeaving(true), remaining.current)
    return () => {
      clearTimeout(timeout)
      remaining.current -= Date.now() - startedAt.current
    }
  }, [paused, leaving])

  return (
    <div
      className="toast"
      data-kind={item.kind}
      data-leaving={leaving}
      role={item.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onAnimationEnd={(event) => {
        if (leaving && event.animationName === 'toast-out') dismissToast(item.id)
      }}
    >
      <Icon className="toast__icon" aria-hidden />
      <span className="toast__message">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            item.action?.onClick()
            setLeaving(true)
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  )
}
