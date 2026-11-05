/** One static card of the sign-in screen's proof strip, as the organisation setting lists it. */
export interface ProofCard {
  tone: 'warning' | 'info' | 'positive' | 'danger'
  chip: string
  text: string
  figure?: string
}

/**
 * Up to three cards that show what the product does, drawn from the organisation setting. Decorative: hidden from
 * assistive technology, no links, no motion, nothing to focus. The words are the journey's; this only lays them out.
 */
export function ProofStrip({ cards }: { cards: ProofCard[] }) {
  return (
    <ul className="proof-strip" aria-hidden="true">
      {cards.slice(0, 3).map((card) => (
        <li key={card.chip} className="proof-card">
          <span className={`proof-card__chip proof-card__chip--${card.tone}`}>{card.chip}</span>
          <span className="proof-card__text">{card.text}</span>
          {card.figure && <span className="proof-card__figure">{card.figure}</span>}
        </li>
      ))}
    </ul>
  )
}
