/**
 * Where to go after signing in. Only same-app paths are accepted: a `?next=https://elsewhere`, the
 * protocol-relative `//elsewhere`, `/\\elsewhere`, `javascript:`, and anything the browser would quietly turn into
 * one of those (a tab or newline inside the path, an encoded slash) fall back to Home. The server checks the same
 * rule again (accounts.views.safe_redirect), because this copy is a convenience and that one is the guarantee.
 */
export function safeNext(raw: string | null): string {
  if (!raw || raw.length > 2000 || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(raw) || /%(2f|5c|0[0-9a-f]|1[0-9a-f])/i.test(raw)) return '/'
  try {
    const base = typeof window === 'undefined' ? 'http://app.test' : window.location.origin
    if (new URL(raw, base).origin !== base) return '/'
  } catch {
    return '/'
  }
  if (raw === '/login' || raw.startsWith('/login?') || raw.startsWith('/login/')) return '/'
  return raw
}

export function loginUrl(next: string) {
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
}

const SIGNED_OUT = 'clicker.signedOut'

/** Remember, for the next page only, that the person chose to sign out (the sign-in screen says so once). */
export function markSignedOut() {
  try {
    window.sessionStorage.setItem(SIGNED_OUT, '1')
  } catch {
    // Without storage the screen simply doesn't say it.
  }
}

/** True once after markSignedOut(); reading it clears it. */
export function takeSignedOut(): boolean {
  try {
    const was = window.sessionStorage.getItem(SIGNED_OUT) === '1'
    window.sessionStorage.removeItem(SIGNED_OUT)
    return was
  } catch {
    return false
  }
}
