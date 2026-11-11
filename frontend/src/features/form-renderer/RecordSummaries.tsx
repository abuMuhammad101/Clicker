import { useLayoutEffect, useRef, useState } from 'react'
import { FigureNumber } from '@/components/FigureNumber'
import { groupThousands, formatMoney, formatMoneyCompact } from '@/lib/money'
import type { RecordSummary } from '@/types/record'
import './RecordSummaries.css'

/**
 * Up to four figures about this one record, under its title (Schema.record_summaries):
 * a customer's balance, how late, what they have on account. Read-only, large,
 * and exact: a single record's own amounts show their paisa. A figure this user
 * can't read never arrives, so the strip simply has fewer cards. An empty figure
 * is "—", never 0: nothing overdue is not "0 days".
 */
export function RecordSummaries({ summaries }: { summaries: RecordSummary[] | undefined }) {
  if (!summaries || summaries.length === 0) return null
  return (
    <dl className="record-summaries" aria-label="Key figures">
      {summaries.map((summary) => {
        const empty = summary.value == null
        return (
          <div key={summary.key} className="record-summaries__item">
            <dt className="record-summaries__label">{summary.label}</dt>
            {empty ? (
              <dd className="record-summaries__value record-summaries__value--empty">—</dd>
            ) : (
              <Figure summary={summary} />
            )}
          </div>
        )
      })}
    </dl>
  )
}

function format(summary: RecordSummary) {
  const value = summary.value as string
  if (summary.type === 'currency') return formatMoney(value)
  const [whole = '0'] = value.split('.')
  return `${whole.startsWith('-') ? '−' : ''}${groupThousands(whole.replace(/^-/, ''))}`
}

/**
 * A single record's own amount is exact, paisa and all. When the exact figure does not fit its card (a crore
 * with paisa in a four-up strip), it steps down to the compact form ("Rs 33.3 crore") rather than being cut
 * with an ellipsis, and the exact figure is the tooltip. Same rule as a total, applied only when it has to be.
 */
function Figure({ summary }: { summary: RecordSummary }) {
  const element = useRef<HTMLElement>(null)
  const exact = format(summary)
  const [compact, setCompact] = useState(false)
  const canCompact = summary.type === 'currency'
  useLayoutEffect(() => {
    const node = element.current
    if (!node || !canCompact) return
    const fit = () => setCompact(node.scrollWidth > node.clientWidth + 1)
    if (!compact) fit()
    if (typeof ResizeObserver === 'undefined') return
    // Back to exact when the card changes width (measured by trying it again). The first report on observe
    // is the width it already has, which must not restart the measurement.
    const card = node.parentElement ?? node
    let width = card.clientWidth
    const observer = new ResizeObserver(() => {
      if (card.clientWidth === width) return
      width = card.clientWidth
      setCompact(false)
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [exact, compact, canCompact])
  return (
    <dd
      ref={element}
      className={Number(summary.value) === 0 ? 'record-summaries__value record-summaries__value--zero' : 'record-summaries__value'}
      title={compact ? exact : undefined}
    >
      <FigureNumber text={compact ? formatMoneyCompact(summary.value as string) : exact} />
    </dd>
  )
}
