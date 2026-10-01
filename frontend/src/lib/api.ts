const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error('VITE_API_URL is not set — check .env at the repo root.')
}

/**
 * DRF's validation error body: field name → messages, plus
 * `non_field_errors` for errors that belong to the record as a whole.
 */
export type ValidationErrors = Record<string, string[]>

export class ApiError extends Error {
  status: number
  /** Present on a 400: the per-field validation errors. */
  validation?: ValidationErrors

  constructor(status: number, message: string, validation?: ValidationErrors) {
    super(message)
    this.status = status
    this.validation = validation
  }
}

/**
 * The CSRF token for writes. It arrives in JSON from the auth endpoints
 * (both cookies are httpOnly, so it can't be read from document.cookie) and
 * lives only in memory: a reload re-fetches it with the session check.
 */
let csrfToken: string | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

/**
 * Called whenever any request comes back 401 — the session has ended or
 * was never there. The auth layer listens and decides what that means
 * (a login redirect on first load, a re-sign-in prompt mid-session), so
 * no screen has to handle it itself.
 */
type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

export function onUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

const SESSION_ENDED = 'Your session has ended. Sign in again, then try once more.'

interface RequestOptions extends RequestInit {
  /** Don't announce a 401: the caller is checking whether a session exists. */
  probe?: boolean
}

async function request<T>(path: string, { probe, ...init }: RequestOptions = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (method !== 'GET' && csrfToken) headers.set('X-CSRFToken', csrfToken)

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    // The session cookie belongs to the API's origin; send it cross-origin.
    credentials: 'include',
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    if (response.status === 401) {
      if (!probe) unauthorizedListeners.forEach((listener) => listener())
      throw new ApiError(401, SESSION_ENDED)
    }
    const validation =
      response.status === 400 && body && typeof body === 'object' && !('detail' in body)
        ? (body as ValidationErrors)
        : undefined
    throw new ApiError(response.status, body?.detail ?? response.statusText, validation)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function apiGet<T>(path: string, options?: { probe?: boolean }): Promise<T> {
  return request<T>(path, options)
}

export function apiSend<T>(method: 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
