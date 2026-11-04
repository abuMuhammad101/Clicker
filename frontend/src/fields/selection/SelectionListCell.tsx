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

export function SelectionListCell({ value, choices, tones }: SelectionListCellProps) {
  const selected = choices.find((choice) => choice.value === value)
  return (
    <ListCell empty={!selected}>
      {selected &&
        (tones ? (
          <StatusChip label={selected.label} tone={tones[selected.value] ?? 'neutral'} />
        ) : (
          <span className="list-cell__chip">{selected.label}</span>
        ))}
    </ListCell>
  )
}
