/** One card of "Waiting for you", as GET /api/home/waiting/ describes it. */
export interface WaitingCard {
  app_label: string
  model: string
  /** The model's own words for one and for many (its verbose_name and plural), from the schema. */
  singular: string
  plural: string
  state: string
  state_label: string
  count: number
  /** What the person can do to them, each as the transition's own action ("approve", "gate out"). */
  actions: string[]
  filter: string
}

/** "6 disbursements to approve", "1 bill to post", "3 jobs to gate out or close". */
export function cardSentence(card: Pick<WaitingCard, 'count' | 'singular' | 'plural' | 'actions'>): string {
  return `${card.count.toLocaleString()} ${cardRest(card)}`
}

/** The sentence after the number ("disbursements to approve"), for a card that sets the number big. */
export function cardRest(card: Pick<WaitingCard, 'count' | 'singular' | 'plural' | 'actions'>): string {
  return `${card.count === 1 ? card.singular : card.plural} to ${card.actions.join(' or ')}`
}

export const SHOWN = 4

/** At most `limit` cards (the biggest first, as sent), and how many are left over. */
export function capCards<T>(cards: T[], limit = SHOWN): { shown: T[]; more: number } {
  return { shown: cards.slice(0, limit), more: Math.max(0, cards.length - limit) }
}
