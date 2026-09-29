import { ListCell } from '../shared/ListCell'
import type { Choice } from './SelectionField'

interface SelectionListCellProps {
  value: string | null
  choices: Choice[]
}

export function SelectionListCell({ value, choices }: SelectionListCellProps) {
  const selected = choices.find((choice) => choice.value === value)
  return (
    <ListCell empty={!selected}>
      {selected && <span className="list-cell__chip">{selected.label}</span>}
    </ListCell>
  )
}
