import { useState } from 'react'
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react'
import { SaveBar } from '@/components/SaveBar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth, type User } from '@/features/auth/authContext'
import type { FormState } from '@/features/form-renderer/FormRenderer'
import { Link } from '@/lib/Link'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  /** Omitted for the current page, and for levels with no page of their own. */
  to?: string
}

interface TopBarProps {
  crumbs: Crumb[]
  user: User
  /** The page's form, while it has unsaved changes: the bar becomes a save bar. */
  unsaved?: FormState | null
}

/**
 * Where you are (left), who you are (right), and nothing in the middle: that
 * space is reserved, not filled. While the page's form is dirty, the whole bar
 * transforms into the save bar and returns to this when the form is clean.
 */
export function TopBar({ crumbs, user, unsaved }: TopBarProps) {
  if (unsaved) {
    return (
      <header className={cn('top-bar', 'header--unsaved')}>
        <SaveBar state={unsaved} />
      </header>
    )
  }

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
      <UserMenu user={user} />
    </header>
  )
}

function UserMenu({ user }: { user: User }) {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="user-menu__trigger" aria-label="Account menu">
          <span className="user-menu__name">{user.display_name}</span>
          <ChevronDown className="user-menu__chevron" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="user-menu">
        <div className="user-menu__who">
          <p className="user-menu__who-name">{user.display_name}</p>
          {(user.email || user.username) && (
            <p className="user-menu__who-detail">{user.email || user.username}</p>
          )}
        </div>
        <button type="button" className="user-menu__item" onClick={() => void logout('/login')}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </PopoverContent>
    </Popover>
  )
}
