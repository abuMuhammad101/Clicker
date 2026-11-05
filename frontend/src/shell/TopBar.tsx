import { setThemeChoice, themeChoice, type ThemeChoice } from '@/lib/theme'
import { HelpMenu } from './HelpMenu'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Eye, LogOut } from 'lucide-react'
import { SaveBar } from '@/components/SaveBar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth, type User } from '@/features/auth/authContext'
import type { FormState } from '@/features/form-renderer/FormRenderer'
import { ViewAsDialog } from '@/features/view-as/ViewAsDialog'
import { Link } from '@/lib/Link'
import { viewingAs } from '@/lib/viewAs'
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
      <div className="top-bar__tools">
        <HelpMenu />
        <UserMenu user={user} />
      </div>
    </header>
  )
}

function UserMenu({ user }: { user: User }) {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [viewAs, setViewAs] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(themeChoice)

  return (
    <>
    <ViewAsDialog open={viewAs} onOpenChange={setViewAs} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="user-menu__trigger" aria-label="Account menu" data-tour="user-menu">
          <span className="user-menu__avatar" aria-hidden="true">
            {user.display_name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="user-menu__name">{user.display_name}</span>
          <ChevronDown className="user-menu__chevron" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="user-menu">
        <div className="user-menu__who">
          <p className="user-menu__who-name">{user.display_name}</p>
          {user.role && <p className="user-menu__role">{user.role}</p>}
          {(user.email || user.username) && (
            <p className="user-menu__who-detail">{user.email || user.username}</p>
          )}
        </div>
        <div className="user-menu__theme" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              className="user-menu__theme-option"
              aria-pressed={theme === choice}
              onClick={() => {
                setThemeChoice(choice)
                setTheme(choice)
              }}
            >
              {choice === 'system' ? 'System' : choice === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
        {user.can_view_as_role && !viewingAs() && (
          <button
            type="button"
            className="user-menu__item"
            onClick={() => {
              setOpen(false)
              setViewAs(true)
            }}
          >
            <Eye className="size-4" aria-hidden />
            View as role…
          </button>
        )}
        <button type="button" className="user-menu__item" onClick={() => void logout('/login')}>
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
      </PopoverContent>
    </Popover>
    </>
  )
}
