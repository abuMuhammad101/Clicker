import { cn } from '@/lib/utils'
import { ListCell } from '../shared/ListCell'
import { formatDecimalDisplay, splitDecimalDisplay } from './decimalFormat'

interface DecimalListCellProps {
  value: number | null
  decimalPlaces: number
}

export function DecimalListCell({ value, decimalPlaces }: DecimalListCellProps) {
  const isNegative = value != null && value < 0
  const [whole, decimals] = splitDecimalDisplay(
    value != null ? formatDecimalDisplay(value, decimalPlaces) : '',
  )
  return (
    <ListCell empty={value == null} className="list-cell--numeric">
      <span className={cn(isNegative && 'text-[color:var(--danger)]')}>
        {whole}
        {decimals && <span className="list-cell__decimals">{decimals}</span>}
      </span>
    </ListCell>
  )
}
