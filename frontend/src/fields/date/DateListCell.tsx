import { formatDate } from '@/lib/dates'
import { ListCell } from '../shared/ListCell'

/** "30 Oct 2026": unambiguous in every locale. Tabular, so a column of dates lines up. */
export function DateListCell({ value }: { value: string | null }) {
  const text = formatDate(value)
  return (
    <ListCell empty={!text}>
      <time dateTime={value ?? undefined} className="list-cell__text tabular-nums">
        {text}
      </time>
    </ListCell>
  )
}
