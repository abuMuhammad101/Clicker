import { groupThousands, formatMoney } from '@/lib/money'
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
            <dd className={empty ? 'record-summaries__value record-summaries__value--empty' : 'record-summaries__value'}>
              {empty ? '—' : format(summary)}
            </dd>
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
