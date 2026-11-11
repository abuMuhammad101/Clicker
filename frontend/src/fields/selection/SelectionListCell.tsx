import { StatusChip } from '@/components/StatusChip'
import type { Tone } from '@/types/schema'
import { ListCell } from '../shared/ListCell'
import type { Choice } from './SelectionField'

interface SelectionListCellProps {
  value: string | null
  choices: Choice[]
  /** When the schema gives each value a tone, it reads as a status chip. */
  tones?: Record<string, Tone>
}

/**
 * A choice reads as a chip only when it is a state (the schema gives it a tone). Otherwise it is a word in the
 * row like any other ("Company", "Manager"): chips are for states, and a grey chip on every row is noise.
 */
export function SelectionListCell({ value, choices, tones }: SelectionListCellProps) {
  const selected = choices.find((choice) => choice.value === value)
  return (
    <ListCell empty={!selected}>
      {selected &&
        (tones ? (
          <StatusChip label={selected.label} tone={tones[selected.value] ?? 'neutral'} />
        ) : (
          <span className="list-cell__text">{selected.label}</span>
        ))}
    </ListCell>
  )
}
