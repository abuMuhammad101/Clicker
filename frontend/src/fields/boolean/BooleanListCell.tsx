import { Check, X } from 'lucide-react'
import { ListCell } from '../shared/ListCell'
import type { ListCellProps } from '../shared/types'

export function BooleanListCell({ value }: ListCellProps<boolean>) {
  return (
    <ListCell>
      {value ? (
        <Check className="size-3.5" style={{ color: 'var(--positive)' }} aria-label="Yes" />
      ) : (
        <X className="size-3.5" style={{ color: 'var(--text-disabled)' }} aria-label="No" />
      )}
    </ListCell>
  )
}
