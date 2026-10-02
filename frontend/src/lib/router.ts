import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'

/**
 * Client-side navigation, deliberately small: enough for the shell to stay
 * mounted while the page inside it changes, and for an unsaved form to
 * intercept any in-app navigation. Routes are still matched by plain regex
 * in the shell; there is no route tree, loader, or data layer here.
 *
 *   navigate(to)            push a new entry (blockers may intercept)
 *   navigate(to, {replace}) replace the current entry
 *   <Link to>               an <a> that navigates in-app (lib/Link.tsx)
 *   useLocation()           re-renders on every navigation
 *   useNavigationBlocker()  lets a screen hold navigation back (unsaved form)
 *
 * The contract that makes unsaved-changes guards work in every container:
 * any change that can drop a mounted screen goes through navigate(). The page
 * changing is a navigation; so is a peek layer closing, because peek state
 * lives in the URL. A future tab or split container must do the same.
 */

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((listener) => listener())
}

function currentUrl() {
  return window.location.pathname + window.location.search
}

/**
 * What "leaving" means depends on what contains the screen holding the
 * blocker. A form on the page is left when the page changes; a form in a peek
 * layer is left when that layer closes, which can happen with the page staying
 * exactly where it is. Containers provide their scope through context, so the
 * form just calls useNavigationBlocker() and never knows which it is in.
 */
export interface NavigationScope {
  /** Inner containers have higher orders and are asked first. */
  order: number
  /** Would going from one URL to another drop what this scope holds? */
  leaves(from: string, to: string): boolean
}

const pathOf = (url: string) => url.split('?')[0]

const pageScope: NavigationScope = {
  order: 0,
  leaves: (from, to) => pathOf(from) !== pathOf(to),
}

export const NavigationScopeContext = createContext<NavigationScope>(pageScope)

/**
 * A blocker returns true to stop a navigation and take over: it is then
 * responsible for calling `navigate(to, { force: true })` (or not) once the
 * user decides.
 */
interface BlockerEntry {
  order: number
  run: (to: string) => boolean
}
const blockers = new Set<BlockerEntry>()

/**
 * Several screens can be unsaved at once (a page, and a peek open over it).
 * They are asked innermost first. `navigate(to, { force: true })` from a
 * blocker means "I'm satisfied", not "ignore everyone": the navigation then
 * carries on to the blockers that haven't been asked yet, so confirming
 * "Discard & leave" in a peek doesn't silently throw away the page behind it.
 */
let pending: { to: string; rest: BlockerEntry[] } | null = null

function firstBlocking(to: string, entries: BlockerEntry[]) {
  for (let i = 0; i < entries.length; i++) {
    if (!blockers.has(entries[i])) continue
    if (entries[i].run(to)) {
      pending = { to, rest: entries.slice(i + 1) }
      return true
    }
  }
  return false
}

const innermostFirst = () => [...blockers].sort((a, b) => b.order - a.order)

let lastUrl = currentUrl()

export function navigate(to: string, options: { replace?: boolean; force?: boolean } = {}) {
  if (to === currentUrl()) return
  if (!options.force) {
    if (firstBlocking(to, innermostFirst())) return
  } else if (pending && pending.to === to) {
    const { rest } = pending
    pending = null
    if (firstBlocking(to, rest)) return
  } else {
    pending = null
  }
  pending = null
  if (options.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  lastUrl = currentUrl()
  notify()
}

// Back/forward: the URL has already changed by the time we hear about it.
// If something blocks, put the old URL back and let the blocker decide.
window.addEventListener('popstate', () => {
  const to = currentUrl()
  if (firstBlocking(to, innermostFirst())) {
    window.history.pushState(null, '', lastUrl)
    return
  }
  pending = null
  lastUrl = to
  notify()
})

/** Where the app is right now, read at call time (for code outside React). */
export function currentLocation() {
  const [pathname, search = ''] = currentUrl().split(/(?=\?)/)
  return { pathname, search }
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLocation() {
  const url = useSyncExternalStore(subscribe, currentUrl)
  const [pathname, search = ''] = url.split(/(?=\?)/)
  return { pathname, search }
}

/**
 * While `active`, any in-app navigation that would drop the calling screen
 * (as its container defines "drop") goes to `onBlocked` instead.
 */
export function useNavigationBlocker(active: boolean, onBlocked: (to: string) => void) {
  const scope = useContext(NavigationScopeContext)
  useEffect(() => {
    if (!active) return
    const entry: BlockerEntry = {
      order: scope.order,
      run: (to) => {
        const from = currentUrl()
        if (to === from || !scope.leaves(from, to)) return false
        onBlocked(to)
        return true
      },
    }
    blockers.add(entry)
    return () => {
      blockers.delete(entry)
    }
  }, [active, onBlocked, scope])
}
