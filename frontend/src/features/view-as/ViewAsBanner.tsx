import { Eye } from 'lucide-react'
import { stopViewingAs, viewingAs } from '@/lib/viewAs'
import './ViewAs.css'

/**
 * Always on top while a role is being viewed: which role, that nothing can be changed, and the way out. A slim
 * dark strip in the inverse surface (the same family as a toast and the bulk bar): it is about a mode you chose,
 * not about the page, so it must never be mistaken for the page's own content or for a warning.
 */
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
        Viewing as <strong className="view-as-banner__role">{role}</strong>
        <span className="view-as-banner__rule" aria-hidden />
        <span className="view-as-banner__note">Read only. Nothing you open can be changed.</span>
      </p>
      <button type="button" className="view-as-banner__exit" onClick={exit}>
        Exit view
      </button>
    </div>
  )
}
