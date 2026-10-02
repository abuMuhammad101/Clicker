import type { NavigationScope } from '@/lib/router'
import { sameTarget } from '@/records'
import { readPeekStack } from './peekUrl'

/**
 * Layer N (1-based) is left when the page changes, or when the stack stops
 * starting with the N entries it has now. Opening another peek on top, or
 * opening one over a page with unsaved edits, leaves everything alone.
 */
const scopes = new Map<number, NavigationScope>()
export function peekScope(order: number): NavigationScope {
  let scope = scopes.get(order)
  if (!scope) {
    scope = {
      order,
      leaves(from, to) {
        const [fromPath, fromSearch = ''] = from.split(/(?=\?)/)
        const [toPath, toSearch = ''] = to.split(/(?=\?)/)
        if (fromPath !== toPath) return true
        const before = readPeekStack(fromSearch)
        const after = readPeekStack(toSearch)
        for (let i = 0; i < order; i++) {
          if (!after[i] || !before[i] || !sameTarget(before[i], after[i])) return true
        }
        return false
      },
    }
    scopes.set(order, scope)
  }
  return scope
}
