import { ListCell } from '../shared/ListCell'
import type { ListCellProps } from '../shared/types'

export function PhoneListCell({ value }: ListCellProps<string>) {
  return (
    <ListCell empty={!value} title={value ?? undefined}>
      <span className="list-cell__text">{value}</span>
    </ListCell>
  )
}
