import { Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { stopViewingAs, viewingAs } from '@/lib/viewAs'
import './ViewAs.css'

/** Always on top while a role is being viewed: what this is, that it is read-only, and the way out. */
export function ViewAsBanner() {
  const role = viewingAs()
  if (!role) return null
  const exit = () => {
    stopViewingAs()
    window.location.assign('/')
  }
  return (
    <div className="view-as-banner" role="status">
      <Eye className="view-as-banner__icon" aria-hidden />
      <p className="view-as-banner__text">
        You are viewing as <strong>{role}</strong>. Nothing here can be changed.
      </p>
      <Button variant="outline" className="h-[var(--control-height)]" onClick={exit}>
        Exit
      </Button>
    </div>
  )
}
