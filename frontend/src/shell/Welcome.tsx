import { Compass, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTour } from '@/features/tour/TourProvider'
import { apiGet } from '@/lib/api'
import { Link } from '@/lib/Link'
import { organisation } from '@/lib/organisation'
import { usePreference } from '@/lib/usePreference'
import type { User } from '@/features/auth/authContext'
import './welcome.css'

/** One card of "Waiting for you", as GET /api/home/waiting/ describes it. */
interface WaitingCard {
  app_label: string
  model: string
  plural: string
  state: string
  state_label: string
  count: number
  actions: string[]
  filter: string
}

/**
 * The welcome, shown until it is put away (once, remembered per person on the server): who you are signed in as,
 * and a quiet way into the tour. Nothing modal, nothing that comes back after it is dismissed. The tour stays in
 * the Help menu either way.
 */
export function WelcomeNote({ user, dismissed }: { user: User; dismissed: ReturnType<typeof useWelcome> }) {
  const { tour, canResume, start, resume } = useTour()
  const name = organisation().name
  if (!dismissed.ready || dismissed.value) return null
  return (
    <div className="welcome" role="region" aria-label="Welcome">
      <p className="welcome__line">
        {user.role ? `You’re signed in as ${user.role}${name ? ` at ${name}` : ''}.` : name ? `Welcome to ${name}.` : 'Welcome.'}
      </p>
      <div className="welcome__actions">
        {tour && (
          <Button type="button" variant="outline" onClick={canResume ? resume : start} className="h-[var(--control-height)]">
            <Compass className="size-4" aria-hidden />
            {canResume ? 'Pick up the tour' : 'Take the tour'}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => dismissed.set(true)}
          className="h-[var(--control-height)] text-[color:var(--text-muted)]"
        >
          <X className="size-4" aria-hidden />
          Dismiss
        </Button>
      </div>
    </div>
  )
}

/** Whether the welcome has been put away (per person, on the server). */
export function useWelcome() {
  return usePreference<boolean>('welcome.dismissed', false)
}

/** What is waiting for this person, or null until it has been asked. */
export function useWaiting(): WaitingCard[] | null {
  const [cards, setCards] = useState<WaitingCard[] | null>(null)
  useEffect(() => {
    let cancelled = false
    apiGet<{ cards: WaitingCard[] }>('/home/waiting/')
      .then(({ cards: found }) => !cancelled && setCards(found))
      .catch(() => !cancelled && setCards([]))
    return () => {
      cancelled = true
    }
  }, [])
  return cards
}

/**
 * What is waiting for this person: records in a state they can move forward, counted as they may see them
 * (the server derives it from each model's workflow and this person's grants). Hidden when there is nothing:
 * no card, no zero, no urgency that is not real.
 */
export function WaitingStrip({ cards }: { cards: WaitingCard[] | null }) {
  if (!cards || cards.length === 0) return null
  return (
    <section className="waiting" aria-label="Waiting for you" data-tour="waiting">
      <h2 className="waiting__title">Waiting for you</h2>
      <ul className="waiting__list">
        {cards.map((card) => (
          <li key={`${card.app_label}.${card.model}.${card.state}`}>
            <Link
              to={`/${card.app_label}/${card.model}?filter=${encodeURIComponent(card.filter)}`}
              className="waiting__card"
              title={`${card.count} ${card.plural} at ${card.state_label}. Your next step: ${card.actions.join(' or ').toLowerCase()}.`}
            >
              <span className="waiting__count">{card.count.toLocaleString()}</span>
              <span className="waiting__what">
                <span className="waiting__plural">{card.plural}</span>
                <span className="waiting__next">{card.state_label} · {card.actions.join(' or ')}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
