import { Skeleton } from '@/components/ui/skeleton'
import type { Summary } from '@/lib/listQuery'
import { aggregateDisplay } from '@/fields/aggregateDisplay'
import { cn } from '@/lib/utils'
import './SummaryStrip.css'

/**
 * Up to four figures over the rows the list shows (Schema.summaries), counted
 * in the database. Money reads in lakh and crore, the exact figure on hover.
 * Clicking one narrows the list to what it counts. A summary this user can't
 * read never arrives, so it's simply absent: no locked card, no hint of it.
 */
export function SummaryStrip({
  summaries,
  loading,
  onApply,
  slots,
}: {
  summaries: Summary[] | null
  loading: boolean
  onApply?: (summary: Summary) => void
  /** How many to sketch while the first answer is on its way. */
  slots: number
}) {
  if (!summaries && !loading) return null
  if (!summaries) {
    return (
      <div className="summary-strip" aria-busy="true">
        {Array.from({ length: slots }, (_, index) => (
          <div key={index} className="summary-strip__item summary-strip__item--static">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-[var(--space-3)] h-5 w-28" />
          </div>
        ))}
      </div>
    )
  }
  if (summaries.length === 0) return null
  return (
    <div className={cn('summary-strip', loading && 'summary-strip--updating')} role="group" aria-label="Summaries" data-tour="summary-strip">
      {summaries.map((summary) => {
        const { short, exact } = aggregateDisplay(summary.type, summary.value, summary.aggregate)
        const clickable = onApply && summary.filter.length > 0
        const content = (
          <>
            <span className="summary-strip__label">{summary.label}</span>
            <span className={cn('summary-strip__value', isZero(summary.value) && 'summary-strip__value--zero')}>
              {short}
            </span>
          </>
        )
        return clickable ? (
          <button
            key={summary.key}
            type="button"
            className="summary-strip__item"
            title={`${exact}. Show only these.`}
            onClick={() => onApply(summary)}
          >
            {content}
          </button>
        ) : (
          <div key={summary.key} className="summary-strip__item summary-strip__item--static" title={exact}>
            {content}
          </div>
        )
      })}
    </div>
  )
}

function isZero(value: string) {
  return Number(value) === 0
}
