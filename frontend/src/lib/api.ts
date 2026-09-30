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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const validation =
      response.status === 400 && body && typeof body === 'object' && !('detail' in body)
        ? (body as ValidationErrors)
        : undefined
    throw new ApiError(response.status, body?.detail ?? response.statusText, validation)
  }
  return response.json() as Promise<T>
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function apiSend<T>(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
