import { ListCell } from '../shared/ListCell'
import { Amount } from './DecimalField'

interface DecimalListCellProps {
  value: string | null
  decimalPlaces: number
  /** A currency symbol ("Rs"), for currency cells. */
  symbol?: string
}

/** Right-aligned, tabular, decimals muted; a negative is a minus sign, never red. */
export function DecimalListCell({ value, decimalPlaces, symbol }: DecimalListCellProps) {
  const empty = value == null || value === ''
  return (
    <ListCell empty={empty} className="list-cell--numeric">
      {!empty && <Amount value={value} places={decimalPlaces} symbol={symbol} />}
    </ListCell>
  )
}
