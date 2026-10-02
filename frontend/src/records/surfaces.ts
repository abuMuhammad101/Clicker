import { useEffect, useRef } from 'react'
import { recordPath, type ModelRef, type RecordId, type RecordTarget } from './paths'

/**
 * The navigation intent layer.
 *
 * Anything that wants a record shown — a list row, a many_to_one value, a
 * "New" button, a future command palette — calls `openRecord()` and names a
 * SURFACE, a kind of place a record can appear. It never says how that place
 * works. Containers (the shell's page area, the peek drawer, one day a tab bar
 * or a split pane) register a handler for the surface they implement.
 *
 * Adding a surface is therefore one `registerSurface()` call. No caller
 * changes, because no caller ever knew which containers exist.
 *
 *   page   the main area; the record becomes the current location
 *   peek   a drawer over the current screen (see surfaces/PeekHost)
 *   tab    reserved: an open-records tab bar
 *   split  reserved: a second pane beside the page
 *
 * Asking for a surface nobody has registered falls back to `page`, so a
 * caller written for `tab` degrades to something that works instead of
 * silently doing nothing.
 *
 * ONE LIVE VIEW PER RECORD. Two views of one record would drift: two copies of
 * the same unsaved edit, each thinking it's current. So before opening
 * anywhere, the layer asks every registered surface whether it already holds
 * the record; if one does, that view is brought forward (`reveal`) and nothing
 * new opens — whichever surface the caller asked for. The one deliberate
 * exception is `takeover`, for "move this record to another surface" (the
 * peek's "open as full page"): the existing view is closed by the move itself.
 * `new` is never "held": each new record is its own thing.
 */
export type Surface = 'page' | 'peek' | 'tab' | 'split'

export interface SurfaceHandler {
  /** Show the record here. */
  open(target: RecordTarget): void
  /** Is this record already showing in this surface? */
  holds?(target: RecordTarget): boolean
  /** It is — bring that view forward instead of opening a second one. */
  reveal?(target: RecordTarget): void
}

export interface OpenOptions {
  surface?: Surface
  /** Move the record's existing view to `surface` rather than revealing it. */
  takeover?: boolean
  /** Open the page surface in another browser tab (cmd/ctrl-click). */
  newBrowserTab?: boolean
}

export const DEFAULT_SURFACE: Surface = 'page'

const handlers = new Map<Surface, SurfaceHandler>()

export function registerSurface(surface: Surface, handler: SurfaceHandler) {
  handlers.set(surface, handler)
  return () => {
    if (handlers.get(surface) === handler) handlers.delete(surface)
  }
}

export function openRecord(model: ModelRef, id: RecordId, options: OpenOptions = {}) {
  const target: RecordTarget = { app_label: model.app_label, model: model.model, id }

  // A browser tab isn't a Clicker surface; it's the browser being asked to
  // load the page URL. Handled here so callers don't touch `window`.
  if (options.newBrowserTab) {
    window.open(recordPath(target), '_blank')
    return
  }

  if (!options.takeover && id !== 'new') {
    for (const handler of handlers.values()) {
      if (handler.holds?.(target)) {
        handler.reveal?.(target)
        return
      }
    }
  }

  const requested = options.surface ?? DEFAULT_SURFACE
  const handler = handlers.get(requested) ?? handlers.get(DEFAULT_SURFACE)
  if (!handler) {
    console.warn(`openRecord: no surface registered for "${requested}", and no page fallback.`)
    return
  }
  handler.open(target)
}

/** Register a surface for as long as the calling container is mounted. */
export function useSurface(surface: Surface, handler: SurfaceHandler) {
  // The registered object never changes; it delegates to the latest handler,
  // so a container can close over fresh state without re-registering.
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(
    () =>
      registerSurface(surface, {
        open: (target) => latest.current.open(target),
        holds: (target) => latest.current.holds?.(target) ?? false,
        reveal: (target) => latest.current.reveal?.(target),
      }),
    [surface],
  )
}
