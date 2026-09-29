import { ListCell } from '../shared/ListCell'
import type { ListCellProps } from '../shared/types'

export function EmailListCell({ value }: ListCellProps<string>) {
  return (
    <ListCell empty={!value} title={value ?? undefined}>
      <a href={`mailto:${value}`} className="list-cell__text hover:underline">
        {value}
      </a>
    </ListCell>
  )
}
