import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from '@/lib/Link'
import { cn } from '@/lib/utils'
import type { RegistryApp } from './useRegistry'

interface SidebarProps {
  registry: { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; apps: RegistryApp[] }
  onRetry: () => void
  pathname: string
  collapsed: boolean
  onToggle: () => void
}

/**
 * Navigation, generated. Every group and every link comes from the
 * registry endpoint; nothing here names a module or a model. Installing a
 * module adds its models to this list with no change to this file.
 */
export function Sidebar({ registry, onRetry, pathname, collapsed, onToggle }: SidebarProps) {
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
          registry.apps.map((app) => (
            <section key={app.app_label} className="sidebar__group" aria-label={app.label}>
              {collapsed ? (
                <hr className="sidebar__divider" />
              ) : (
                <h2 className="sidebar__group-label">{app.label}</h2>
              )}
              <ul className="sidebar__list">
                {app.models.map((entry) => {
                  const active = pathname === entry.route || pathname.startsWith(`${entry.route}/`)
                  return (
                    <li key={entry.route}>
                      <Link
                        to={entry.route}
                        className={cn('sidebar__link', active && 'sidebar__link--active')}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? `${entry.label} · ${app.label}` : entry.label}
                      >
                        {/* Collapsed, a model is its initial. Icons would be
                            better, but an icon is module metadata the
                            schema doesn't carry yet — not something to
                            assign here. */}
                        <span className="sidebar__initial" aria-hidden>
                          {entry.label.charAt(0)}
                        </span>
                        {!collapsed && <span className="sidebar__label">{entry.label}</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
      </div>
    </nav>
  )
}
