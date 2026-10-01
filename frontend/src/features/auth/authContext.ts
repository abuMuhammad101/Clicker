import { createContext, useContext } from 'react'

export interface User {
  id: number
  username: string
  display_name: string
  email: string
}

export type AuthState =
  | { status: 'checking' }
  | { status: 'unreachable'; message: string }
  | { status: 'anonymous' }
  /** `expired`: the session ended while this page was open. The page stays
      as it is; the app asks for the password again on top of it. */
  | { status: 'authenticated'; user: User; expired: boolean }

export interface AuthContextValue {
  state: AuthState
  /** Resolves on success; rejects with ApiError (400 = wrong credentials). */
  login: (username: string, password: string) => Promise<void>
  /** Ends the session server-side, then navigates to `then`. */
  logout: (then: string) => Promise<void>
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
