/**
 * Where to go after signing in. Only same-app paths are accepted: a
 * `?next=https://elsewhere` (or the protocol-relative `//elsewhere`) would
 * turn the login page into an open redirect.
 */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  if (raw === '/login' || raw.startsWith('/login?')) return '/'
  return raw
}

export function loginUrl(next: string) {
  return next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`
}
