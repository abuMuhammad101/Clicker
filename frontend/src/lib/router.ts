import { useEffect, useSyncExternalStore } from 'react'

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
 * A blocker returns true to stop a navigation and take over: it is then
 * responsible for calling `navigate(to, { force: true })` (or not) once the
 * user decides.
 */
type Blocker = (to: string) => boolean
const blockers = new Set<Blocker>()

let lastUrl = currentUrl()

export function navigate(to: string, options: { replace?: boolean; force?: boolean } = {}) {
  if (!options.force) {
    for (const blocker of blockers) if (blocker(to)) return
  }
  if (options.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  lastUrl = currentUrl()
  notify()
}

// Back/forward: the URL has already changed by the time we hear about it.
// If something blocks, put the old URL back and let the blocker decide.
window.addEventListener('popstate', () => {
  const to = currentUrl()
  for (const blocker of blockers) {
    if (blocker(to)) {
      window.history.pushState(null, '', lastUrl)
      return
    }
  }
  lastUrl = to
  notify()
})

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

/** While `active`, every in-app navigation goes to `onBlocked` instead. */
export function useNavigationBlocker(active: boolean, onBlocked: (to: string) => void) {
  useEffect(() => {
    if (!active) return
    const blocker: Blocker = (to) => {
      if (to === currentUrl()) return false
      onBlocked(to)
      return true
    }
    blockers.add(blocker)
    return () => {
      blockers.delete(blocker)
    }
  }, [active, onBlocked])
}
