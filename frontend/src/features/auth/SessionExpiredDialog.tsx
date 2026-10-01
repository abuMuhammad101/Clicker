import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useAuth, type User } from './authContext'
import { loginUrl } from './redirects'
import { SignInForm } from './SignInForm'

/**
 * Shown over the current page when the session ends mid-task. Nothing
 * navigates and nothing unmounts: a half-edited form keeps every value, a
 * list keeps its scroll position and search. Signing in again closes this
 * and leaves the user exactly where they were; whatever request failed can
 * simply be repeated.
 *
 * It can't be dismissed — there's nothing to do on this page without a
 * session — but switching to a different account is one click away.
 */
export function SessionExpiredDialog({ user }: { user: User }) {
  const { login, logout } = useAuth()

  // Whoever signs in next comes back to this page.
  const switchAccount = () => logout(loginUrl(window.location.pathname + window.location.search))

  return (
    <AlertDialog open>
      <AlertDialogContent className="session-expired" onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Your session has ended</AlertDialogTitle>
          <AlertDialogDescription>
            Sign in again to carry on. This page stays as it is, including anything you
            haven’t saved yet.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <SignInForm
          fixedUsername={user.username}
          onSubmit={login}
          secondaryAction={
            <Button
              type="button"
              variant="ghost"
              onClick={() => void switchAccount()}
              className="h-[var(--control-height)]"
            >
              Use another account
            </Button>
          }
        />
      </AlertDialogContent>
    </AlertDialog>
  )
}
