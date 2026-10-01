import { cn } from '@/lib/utils'
import { ListCell } from '../shared/ListCell'
import { formatDecimalDisplay } from './decimalFormat'

interface DecimalListCellProps {
  value: number | null
  decimalPlaces: number
}

export function DecimalListCell({ value, decimalPlaces }: DecimalListCellProps) {
  const isNegative = value != null && value < 0
  return (
    <ListCell empty={value == null} className="list-cell--numeric">
      <span className={cn(isNegative && 'text-[color:var(--danger)]')}>
        {value != null && formatDecimalDisplay(value, decimalPlaces)}
      </span>
    </ListCell>
  )
}
