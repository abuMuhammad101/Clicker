import { useCallback, useEffect, useRef, useState } from 'react'

/** The pointer has to rest this long before the rail opens... */
const OPEN_DELAY_MS = 320
/** ...and has to be away this long before it closes, so a slip off the edge
    (or a trip to a tooltip) doesn't snap it shut. */
const CLOSE_DELAY_MS = 260

/**
 * Hover that means it. A collapsed rail that opened on any pass of the mouse
 * would flicker every time the pointer crossed it on its way elsewhere, so
 * opening takes a dwell, and only a mouse (never touch) with no button held
 * (never a drag) counts. Keyboard focus moving into it opens it at once.
 * Nothing happens while `enabled` is false.
 */
export function useHoverIntent(enabled: boolean) {
  const [open, setOpen] = useState(false)
  const openTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)

  const clear = () => {
    window.clearTimeout(openTimer.current)
    window.clearTimeout(closeTimer.current)
  }

  useEffect(() => clear, [])

  const onPointerEnter = useCallback(
    (event: React.PointerEvent) => {
      if (!enabled || event.pointerType !== 'mouse' || event.buttons !== 0) return
      clear()
      openTimer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS)
    },
    [enabled],
  )

  const onPointerLeave = useCallback(() => {
    clear()
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }, [])

  const onFocus = useCallback(
    (event: React.FocusEvent) => {
      if (!enabled || !event.target.matches(':focus-visible')) return
      clear()
      setOpen(true)
    },
    [enabled],
  )

  const onBlur = useCallback((event: React.FocusEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    clear()
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }, [])

  return { open: enabled && open, handlers: { onPointerEnter, onPointerLeave, onFocus, onBlur } }
}
