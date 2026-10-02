import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import type { ModelRef, RecordId } from './paths'
import { recordPath } from './paths'
import { openRecord, type Surface } from './surfaces'

interface RecordRefProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  model: ModelRef
  id: RecordId
  /** Where a plain click asks for the record to open. Defaults to the page. */
  surface?: Surface
  takeover?: boolean
}

/**
 * Everything in Clicker that points at a record is one of these. It does not
 * navigate: a plain click emits an intent (`openRecord`) and whichever
 * container owns the requested surface decides what that means.
 *
 * It is still a real <a href>, so cmd/ctrl/shift/middle-click and "copy link"
 * keep the browser's own behaviour — they open the record's page URL in a new
 * tab or window, which is correct and needs no code from us.
 */
export function RecordRef({ model, id, surface, takeover, onClick, target, ...rest }: RecordRefProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target && target !== '_self')
    ) {
      return
    }
    event.preventDefault()
    openRecord(model, id, { surface, takeover })
  }
  return (
    <a
      href={recordPath({ ...model, id })}
      target={target}
      onClick={handleClick}
      data-record-ref
      {...rest}
    />
  )
}
