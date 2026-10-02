import { ChevronDown, ChevronRight, Clock, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from '@/lib/Link'
import { cn } from '@/lib/utils'
import { ModelIcon } from './ModelIcon'
import type { RegistryApp } from './useRegistry'

interface SidebarProps {
  registry: { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; apps: RegistryApp[] }
  onRetry: () => void
  pathname: string
  /** The narrow icon rail, as opposed to the full-width sidebar. */
  collapsed: boolean
  onToggle: () => void
  /** App labels whose section is folded shut. Per user, kept on the server. */
  foldedSections: string[]
  onToggleSection: (appLabel: string) => void
}

/**
 * Navigation, generated. Every group, link and icon comes from the registry
 * endpoint; nothing here names a module or a model. Installing a module adds
 * its models to this list with no change to this file. The one fixed entry is
 * Recent, because the home page isn't a module.
 *
 * Collapsed, the sidebar is an icon rail, not nothing: you can still see
 * where you are and where you can go. The rail shows every model's icon
 * whatever the sections' fold state, since folding is about reading a long
 * list, which a rail never is.
 */
export function Sidebar({
  registry,
  onRetry,
  pathname,
  collapsed,
  onToggle,
  foldedSections,
  onToggleSection,
}: SidebarProps) {
  return (
    <nav className={cn('sidebar', collapsed && 'sidebar--collapsed')} aria-label="Modules">
      <div className="sidebar__head">
        {!collapsed && (
          <Link to="/" className="sidebar__brand">
            Clicker
          </Link>
        )}
        <button
          type="button"
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <div className="sidebar__body">
        <ul className="sidebar__list">
          <li>
            <NavLink to="/" label="Recent" active={pathname === '/'} collapsed={collapsed}>
              <Clock className="sidebar__icon" aria-hidden />
            </NavLink>
          </li>
        </ul>

        {registry.status === 'loading' && (
          <div className="sidebar__group" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="sidebar__skeleton" />
            ))}
          </div>
        )}

        {registry.status === 'error' && !collapsed && (
          <div className="sidebar__error" role="alert">
            <p>Navigation didn’t load.</p>
            <button type="button" onClick={onRetry} className="sidebar__retry">
              Try again
            </button>
          </div>
        )}

        {registry.status === 'ready' &&
          registry.apps.map((app) => {
            const folded = !collapsed && foldedSections.includes(app.app_label)
            const listId = `sidebar-section-${app.app_label}`
            return (
              <section key={app.app_label} className="sidebar__group" aria-label={app.label}>
                {collapsed ? (
                  <hr className="sidebar__divider" />
                ) : (
                  <button
                    type="button"
                    className="sidebar__group-toggle"
                    aria-expanded={!folded}
                    aria-controls={listId}
                    onClick={() => onToggleSection(app.app_label)}
                  >
                    {folded ? (
                      <ChevronRight className="sidebar__chevron" aria-hidden />
                    ) : (
                      <ChevronDown className="sidebar__chevron" aria-hidden />
                    )}
                    <span className="sidebar__group-label">{app.label}</span>
                  </button>
                )}
                {!folded && (
                  <ul className="sidebar__list" id={listId}>
                    {app.models.map((entry) => {
                      const active = pathname === entry.route || pathname.startsWith(`${entry.route}/`)
                      return (
                        <li key={entry.route}>
                          <NavLink
                            to={entry.route}
                            label={entry.label}
                            title={collapsed ? `${entry.label} · ${app.label}` : entry.label}
                            active={active}
                            collapsed={collapsed}
                          >
                            <ModelIcon name={entry.icon} className="sidebar__icon" />
                          </NavLink>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
      </div>
    </nav>
  )
}

function NavLink({
  to,
  label,
  title,
  active,
  collapsed,
  children,
}: {
  to: string
  label: string
  title?: string
  active: boolean
  collapsed: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={cn('sidebar__link', active && 'sidebar__link--active')}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={title ?? (collapsed ? label : undefined)}
    >
      {children}
      {!collapsed && <span className="sidebar__label">{label}</span>}
    </Link>
  )
}
