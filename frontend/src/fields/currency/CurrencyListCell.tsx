import { organisation } from '@/lib/organisation'
import { DecimalListCell } from '../decimal/DecimalListCell'

/** "Rs 1,245,000.00": right-aligned, tabular, paisa muted, a minus sign and never red. */
export function CurrencyListCell({ value, decimalPlaces }: { value: string | null; decimalPlaces?: number }) {
  const { currency } = organisation()
  return (
    <DecimalListCell
      value={value}
      decimalPlaces={decimalPlaces ?? currency.decimal_places}
      symbol={currency.symbol}
    />
  )
}
