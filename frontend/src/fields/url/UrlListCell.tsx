import { ListCell } from '../shared/ListCell'
import type { ListCellProps } from '../shared/types'

export function UrlListCell({ value }: ListCellProps<string>) {
  return (
    <ListCell empty={!value} title={value ?? undefined}>
      <a
        href={value ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="list-cell__text hover:underline"
      >
        {value}
      </a>
    </ListCell>
  )
}
