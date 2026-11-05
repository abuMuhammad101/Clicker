import { createContext, useContext } from 'react'

export interface User {
  id: number
  username: string
  display_name: string
  email: string
  /** May see the app as another role (Owner and Manager). */
  can_view_as_role?: boolean
  /** The role as the team page names it ("Accounts"), or empty. */
  role?: string
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
  login: (username: string, password: string, next?: string) => Promise<string>
  /** Like `login`, but the screen stays as it is: the caller loads the page afresh when it is ready. */
  authenticate: (username: string, password: string, next?: string) => Promise<string>
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
