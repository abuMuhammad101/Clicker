import { useSyncExternalStore } from 'react'

/**
 * System response, phrased humanly: "Saved Acme Corporation", "Couldn't save
 * that change". One store, called from anywhere (a container, a field, a
 * hook), drawn once by <Toaster />. Nothing here knows which screen it came
 * from.
 *
 * Stacking: the newest is at the bottom, at most three show, and a fourth
 * pushes the oldest out rather than piling up.
 */
export type ToastKind = 'success' | 'error' | 'info'

export interface ToastOptions {
  kind?: ToastKind
  message: string
  /** One optional action, usually Undo. Pressing it also dismisses. */
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it leaves on its own. Errors and actions stay longer. */
  duration?: number
}

export interface ToastItem extends Required<Pick<ToastOptions, 'kind' | 'message'>> {
  id: number
  action?: ToastOptions['action']
  duration: number
}

const MAX_VISIBLE = 3
let nextId = 1
let items: ToastItem[] = []
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function toast(options: ToastOptions): number {
  const kind = options.kind ?? 'success'
  const item: ToastItem = {
    id: nextId++,
    kind,
    message: options.message,
    action: options.action,
    duration: options.duration ?? (options.action ? 7000 : kind === 'error' ? 6000 : 4000),
  }
  items = [...items, item].slice(-MAX_VISIBLE)
  emit()
  return item.id
}

export function dismissToast(id: number) {
  items = items.filter((item) => item.id !== id)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(
    subscribe,
    () => items,
    () => items,
  )
}
