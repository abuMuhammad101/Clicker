import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProofStrip, type ProofCard } from './ProofStrip'

const card = (chip: string, figure?: string): ProofCard => ({ tone: 'info', chip, text: 'A line (demo)', figure })

describe('ProofStrip', () => {
  it('is decorative: hidden from assistive technology, with nothing to focus or follow', () => {
    const html = renderToStaticMarkup(<ProofStrip cards={[card('One', 'Rs 1.00')]} />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toMatch(/<(a|button|input)\b|tabindex/)
  })

  it('draws three cards at most, however many the organisation lists', () => {
    const html = renderToStaticMarkup(<ProofStrip cards={['A', 'B', 'C', 'D', 'E'].map((c) => card(c))} />)
    expect(html.match(/proof-card"/g)).toHaveLength(3)
    expect(html).not.toContain('>D<')
  })

  it('shows a figure only when the card has one', () => {
    expect(renderToStaticMarkup(<ProofStrip cards={[card('One')]} />)).not.toContain('proof-card__figure')
    expect(renderToStaticMarkup(<ProofStrip cards={[card('One', 'Rs 5.00')]} />)).toContain('Rs 5.00')
  })
})
