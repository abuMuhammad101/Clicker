import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './StatePanel.css'

/**
 * What a screen says when it has no records to show: empty, no match, failed
 * to load, not allowed (403), not there (404). One organism for every list
 * and form, so the five read as one family: an icon, what happened, what it
 * means, and at most one way forward.
 *
 * Content rules: the title says what happened in the user's words, never a
 * status code; the message says what it means or what to do; actions are
 * buttons the caller passes (Try again, Clear search, New contact, Back to
 * contacts). A dead end with no way forward is allowed only for 404.
 */
export function StatePanel({
  icon: Icon,
  mark,
  title,
  message,
  tone = 'neutral',
  children,
  className,
}: {
  icon: LucideIcon
  /** A short code set in the tile instead of the icon ("404"): a code is recognised before it is read. */
  mark?: string
  title: string
  message?: ReactNode
  /** `danger` for failures; everything else is neutral. */
  tone?: 'neutral' | 'danger'
  /** The way forward: one or two buttons. */
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('state-panel', `state-panel--${tone}`, className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className={cn('state-panel__icon', mark && 'state-panel__icon--mark')} aria-hidden>
        {mark ?? <Icon />}
      </span>
      <p className="state-panel__title">{title}</p>
      {message && <p className="state-panel__message">{message}</p>}
      {children && <div className="state-panel__actions">{children}</div>}
    </div>
  )
}
