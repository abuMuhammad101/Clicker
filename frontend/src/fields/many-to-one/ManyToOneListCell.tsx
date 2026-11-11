import { PersonMark } from '@/components/PersonMark'
import { RecordRef, type ModelRef } from '@/records'
import { ListCell } from '../shared/ListCell'

interface ManyToOneListCellProps {
  label: string | null
  /** The related model and record. Without them the cell is plain text. */
  target?: ModelRef
  id?: number | null
  /** The link exists but its target is hidden from this user. */
  restricted?: boolean
  /** The linked record is a person: their initials lead the name. */
  person?: boolean
}

export function ManyToOneListCell({ label, target, id, restricted, person }: ManyToOneListCellProps) {
  if (restricted) {
    return (
      <ListCell title="You don’t have access to this record">
        <span className="list-cell__text restricted-value">Restricted</span>
      </ListCell>
    )
  }
  const text =
    target && id != null ? (
      <RecordRef model={target} id={id} surface="peek" className="list-cell__text hover:underline">
        {label}
      </RecordRef>
    ) : (
      <span className="list-cell__text">{label}</span>
    )
  return (
    <ListCell empty={!label} title={label ?? undefined}>
      {person && label ? (
        <span className="person-name">
          <PersonMark name={label} />
          {text}
        </span>
      ) : (
        text
      )}
    </ListCell>
  )
}
