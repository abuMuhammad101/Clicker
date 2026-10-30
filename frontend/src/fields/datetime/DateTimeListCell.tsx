import { formatDateTime } from '@/lib/dates'
import { ListCell } from '../shared/ListCell'

/** "30 Oct 2026, 14:05", in the organisation's time zone. */
export function DateTimeListCell({ value }: { value: string | null }) {
  const text = formatDateTime(value)
  return (
    <ListCell empty={!text} title={text || undefined}>
      <time dateTime={value ?? undefined} className="list-cell__text tabular-nums">
        {text}
      </time>
    </ListCell>
  )
}
