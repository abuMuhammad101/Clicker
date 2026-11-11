import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RecordSummary } from '@/types/record'
import { RecordSummaries } from './RecordSummaries'

const figures: RecordSummary[] = [
  { key: '0', label: 'Outstanding', aggregate: 'sum', type: 'currency', value: '2732468.47' },
  { key: '1', label: 'Oldest overdue (days)', aggregate: 'sum', type: 'integer', value: null },
  { key: '2', label: 'Advance held', aggregate: 'sum', type: 'currency', value: '0.00' },
  { key: '3', label: 'Open recovery cases', aggregate: 'sum', type: 'integer', value: '12345' },
]

describe('RecordSummaries', () => {
  // The figure's parts are sized separately (currency, rupees, paisa); the text read out is unchanged.
  const html = renderToStaticMarkup(<RecordSummaries summaries={figures} />).replace(/<(?!\/div>)[^>]+>/g, '')

  it("shows a record's own amounts exactly, in lakh grouping, paisa included", () => {
    expect(html).toContain('Rs 27,32,468.47')
  })

  it('shows a real zero as a value, and a missing figure as a dash, never as 0', () => {
    expect(html).toContain('Rs 0.00')
    const overdue = html.split('Oldest overdue (days)')[1].split('</div>')[0]
    expect(overdue.trim()).toBe('—')
  })

  it('groups counts the same way', () => {
    expect(html).toContain('12,345')
  })

  it('draws nothing when the user can read none of the figures', () => {
    expect(renderToStaticMarkup(<RecordSummaries summaries={[]} />)).toBe('')
    expect(renderToStaticMarkup(<RecordSummaries summaries={undefined} />)).toBe('')
  })
})
