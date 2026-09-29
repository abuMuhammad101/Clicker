import { ListCell } from '../shared/ListCell'
import type { ListCellProps } from '../shared/types'

// Multi-line content collapses to one line in a list cell — a table row
// has no room for a paragraph. The full value is still on hover via title.
export function LongtextListCell({ value }: ListCellProps<string>) {
  const singleLine = value?.replace(/\s+/g, ' ').trim()
  return (
    <ListCell empty={!singleLine} title={singleLine ?? undefined}>
      <span className="list-cell__text">{singleLine}</span>
    </ListCell>
  )
}
