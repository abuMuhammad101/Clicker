import type { FieldType } from '@/types/schema'
import { formatMoney, formatMoneyCompact, groupThousands } from '@/lib/money'

/**
 * The display half of the registry for a figure that adds up many records:
 * a group header's sum, a summary-strip card, a filter chip's amount.
 *
 * One rule per type, so no screen decides for itself. A single record's own
 * amount shows its paisa; a total over many never does — money reads in lakh
 * and crore ("Rs 313 crore", "Rs 14 lakh") and the exact figure is the
 * tooltip. `short` is what is drawn; `exact` is what hover shows.
 */
export interface AggregateDisplay {
  short: string
  exact: string
}

type Rule = (value: string, aggregate?: string) => AggregateDisplay

const plainNumber: Rule = (value, aggregate) => {
  const [whole = '0', fraction] = value.split('.')
  const text = `${whole.startsWith('-') ? '−' : ''}${groupThousands(whole.replace(/^-/, ''))}${fraction && aggregate === 'avg' ? `.${fraction}` : ''}`
  return { short: text, exact: text }
}

const AGGREGATE_RULES: Partial<Record<FieldType, Rule>> = {
  currency: (value) => ({ short: formatMoneyCompact(value), exact: formatMoney(value) }),
  integer: plainNumber,
  decimal: plainNumber,
}

export function aggregateDisplay(type: FieldType, value: string, aggregate?: string): AggregateDisplay {
  return (AGGREGATE_RULES[type] ?? plainNumber)(value, aggregate)
}
