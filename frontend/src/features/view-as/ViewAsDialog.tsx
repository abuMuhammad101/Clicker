import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiGet, apiSend, ApiError } from '@/lib/api'
import { startViewingAs } from '@/lib/viewAs'
import './ViewAs.css'

interface RoleRow {
  role: string
  members: number
}

/**
 * Pick a role and see the app as it sees it: its navigation, its screens, its
 * lists. Nothing here can be changed while it lasts. The answer comes from
 * the server (the same permission functions the API uses), never from a
 * second copy of the rules here.
 */
export function ViewAsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [roles, setRoles] = useState<RoleRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    apiGet<{ roles: RoleRow[] }>('/view-as/roles/')
      .then((body) => setRoles(body.roles))
      .catch((problem) => setError(problem instanceof ApiError ? problem.message : 'Could not load the roles.'))
  }, [open])

  const start = async (role: string) => {
    setBusy(role)
    try {
      await apiSend('POST', '/view-as/start/', { role })
      startViewingAs(role)
      // A fresh load: the navigation, schemas and lists all come again, as that role.
      window.location.assign('/')
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : 'Could not start.')
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>View as role</DialogTitle>
          <DialogDescription>
            See the navigation, screens and lists exactly as that role sees them. Nothing can be changed while you do,
            and starting is recorded.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="view-as__error" role="alert">{error}</p>}
        <ul className="view-as__roles">
          {(roles ?? []).map((row) => (
            <li key={row.role}>
              {/* A list of roles, not a stack of boxed buttons: a row lights up under the pointer, and an arrow
                  says where it goes. */}
              <Button
                variant="ghost"
                className="view-as__role"
                disabled={busy != null}
                onClick={() => void start(row.role)}
              >
                <span className="view-as__name">{row.role}</span>
                <span className="view-as__count">
                  {busy === row.role
                    ? 'Opening…'
                    : row.members === 0
                      ? 'No one yet'
                      : row.members === 1
                        ? '1 person'
                        : `${row.members} people`}
                </span>
                <ArrowRight className="view-as__go" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
