import { ListCell } from '../shared/ListCell'

interface ManyToOneListCellProps {
  label: string | null
}

export function ManyToOneListCell({ label }: ManyToOneListCellProps) {
  return (
    <ListCell empty={!label} title={label ?? undefined}>
      <span className="list-cell__text">{label}</span>
    </ListCell>
  )
}
