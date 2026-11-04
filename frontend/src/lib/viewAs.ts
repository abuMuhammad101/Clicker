import type { ModelSchema } from '@/types/schema'

/**
 * "View as role": while it is on, every read is answered as that role (the
 * server swaps in the role's representative; see backend foundation/viewas.py)
 * and nothing can be written. The choice lives in this tab's session storage,
 * so closing the tab ends it; Exit clears it.
 */
const KEY = 'clicker.viewAs'

export function viewingAs(): string | null {
  try {
    return window.sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function startViewingAs(role: string) {
  try {
    window.sessionStorage.setItem(KEY, role)
  } catch {
    // Without storage the choice can't be kept; the caller's reload then shows the normal app.
  }
}

export function stopViewingAs() {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/**
 * The schema as a read-only view of it: the server already refuses every write
 * while viewing as a role, so this only keeps the screens from offering what
 * can't happen (no Save, no New, no transition buttons).
 */
export function readOnlySchema(schema: ModelSchema): ModelSchema {
  return {
    ...schema,
    actions: { view: true, create: false, update: false, archive: false, delete: false },
    fields: Object.fromEntries(
      Object.entries(schema.fields).map(([name, field]) => [name, { ...field, read_only: true, read_only_on_create: true }]),
    ),
    list: { ...schema.list, bulk_actions: [] },
    related_lists: schema.related_lists?.map((list) => ({ ...list, can_add: false })),
    workflow: schema.workflow ? { ...schema.workflow, transitions: [] } : schema.workflow,
  }
}
