import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth, type User } from '@/features/auth/authContext'
import { Link } from '@/lib/Link'

export interface Crumb {
  label: string
  /** Omitted for the current page, and for levels with no page of their own. */
  to?: string
}

/** Where you are, who you are, and the way out. */
export function TopBar({ crumbs, user }: { crumbs: Crumb[]; user: User }) {
  const { logout } = useAuth()

  return (
    <header className="top-bar">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1
            return (
              <li key={`${index}-${crumb.label}`} className="breadcrumbs__item">
                {index > 0 && <ChevronRight className="breadcrumbs__separator" aria-hidden />}
                {crumb.to && !last ? (
                  <Link to={crumb.to} className="breadcrumbs__link" title={crumb.label}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={last ? 'breadcrumbs__current' : 'breadcrumbs__text'}
                    aria-current={last ? 'page' : undefined}
                    title={crumb.label}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      <div className="top-bar__account">
        <span className="top-bar__user" title={user.email || user.username}>
          {user.display_name}
        </span>
        <Button
          variant="ghost"
          onClick={() => void logout('/login')}
          className="h-[var(--control-height-sm)] px-[var(--control-padding-x-sm)] text-[length:var(--text-sm)]"
        >
          Sign out
        </Button>
      </div>
    </header>
  )
}
