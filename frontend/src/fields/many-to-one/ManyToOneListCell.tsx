import { RecordRef, type ModelRef } from '@/records'
import { ListCell } from '../shared/ListCell'

interface ManyToOneListCellProps {
  label: string | null
  /** The related model and record. Without them the cell is plain text. */
  target?: ModelRef
  id?: number | null
}

export function ManyToOneListCell({ label, target, id }: ManyToOneListCellProps) {
  return (
    <ListCell empty={!label} title={label ?? undefined}>
      {target && id != null ? (
        <RecordRef model={target} id={id} surface="peek" className="list-cell__text hover:underline">
          {label}
        </RecordRef>
      ) : (
        <span className="list-cell__text">{label}</span>
      )}
    </ListCell>
  )
}
