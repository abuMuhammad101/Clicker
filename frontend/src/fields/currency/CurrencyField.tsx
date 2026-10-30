import { organisation } from '@/lib/organisation'
import { DecimalField, type DecimalFieldProps } from '../decimal/DecimalField'

type CurrencyFieldProps = Omit<DecimalFieldProps, 'symbol' | 'decimalPlaces'> & { decimalPlaces?: number }

/**
 * Money in the organisation's currency ("Rs 1,245,000.00"): the decimal
 * field with the currency symbol in front and the currency's own scale.
 * Strings throughout; never a JavaScript number.
 */
export function CurrencyField({ decimalPlaces, ...rest }: CurrencyFieldProps) {
  const { currency } = organisation()
  return (
    <DecimalField {...rest} symbol={currency.symbol} decimalPlaces={decimalPlaces ?? currency.decimal_places} />
  )
}
