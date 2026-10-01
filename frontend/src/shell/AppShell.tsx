import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { User } from '@/features/auth/authContext'
import { FormRenderer } from '@/features/form-renderer/FormRenderer'
import { ListRenderer } from '@/features/list-renderer/ListRenderer'
import { SchemaViewer } from '@/features/schema-viewer/SchemaViewer'
import { FieldGallery } from '@/gallery/FieldGallery'
import { navigate, useLocation } from '@/lib/router'
import { PageLabelContext } from './pageLabel'
import { Sidebar } from './Sidebar'
import { TopBar, type Crumb } from './TopBar'
import { findInRegistry, useRegistry, type RegistryApp } from './useRegistry'
import './shell.css'

//   /                        → the first model in the registry
//   /<app>/<model>           list
//   /<app>/<model>/<id>      record
//   /<app>/<model>/new       new record
//   /dev/gallery, /dev/schema  developer pages (not in the nav)
const LIST_ROUTE = /^\/([a-z_]+)\/([a-z_]+)\/?$/
const RECORD_ROUTE = /^\/([a-z_]+)\/([a-z_]+)\/(\d+|new)\/?$/
const DEV_PAGES: Record<string, string> = {
  '/dev/gallery': 'Field gallery',
  '/dev/schema': 'Schema viewer',
}

const COLLAPSED_KEY = 'clicker.sidebar.collapsed'
/** Below this viewport width the sidebar starts collapsed, unless the user chose. */
const NARROW_VIEWPORT = 1100

function initialCollapsed() {
  try {
    const saved = window.localStorage.getItem(COLLAPSED_KEY)
    if (saved != null) return saved === 'true'
  } catch {
    // Storage blocked or unavailable: fall through to the viewport default.
  }
  return window.innerWidth < NARROW_VIEWPORT
}

/**
 * The frame every signed-in page lives in: generated sidebar, breadcrumb
 * top bar, and the page. Navigating between lists and records swaps only
 * the page; the shell, the registry, and the sidebar's state stay put.
 */
export function AppShell({ user }: { user: User }) {
  const { pathname } = useLocation()
  const { state: registry, retry } = useRegistry()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [pageLabel, setPageLabel] = useState<string | null>(null)

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(next))
      } catch {
        // A convenience only; collapsing still works without storage.
      }
      return next
    })
  }, [])

  // "/" has no page of its own (no dashboard yet): open the first module.
  const firstRoute = registry.status === 'ready' ? registry.apps[0]?.models[0]?.route : undefined
  useEffect(() => {
    if (pathname === '/' && firstRoute) navigate(firstRoute, { replace: true })
  }, [pathname, firstRoute])

  const apps = registry.status === 'ready' ? registry.apps : null

  return (
    <div className="app-shell">
      <Sidebar
        registry={registry}
        onRetry={retry}
        pathname={pathname}
        collapsed={collapsed}
        onToggle={toggle}
      />
      <div className="app-shell__main">
        <TopBar crumbs={breadcrumbs(pathname, apps, pageLabel)} user={user} />
        <main className="app-shell__page">
          <PageLabelContext.Provider value={setPageLabel}>
            <Page pathname={pathname} apps={apps} />
          </PageLabelContext.Provider>
        </main>
      </div>
    </div>
  )
}

function breadcrumbs(pathname: string, apps: RegistryApp[] | null, pageLabel: string | null): Crumb[] {
  if (DEV_PAGES[pathname]) return [{ label: 'Developer' }, { label: DEV_PAGES[pathname] }]

  const record = RECORD_ROUTE.exec(pathname)
  const list = record ? null : LIST_ROUTE.exec(pathname)
  const [, appLabel, model] = record ?? list ?? []
  if (!appLabel || !apps) return []

  const found = findInRegistry(apps, appLabel, model)
  if (!found) return [{ label: 'Not found' }]

  const crumbs: Crumb[] = [
    { label: found.app.label },
    { label: found.model.label, to: found.model.route },
  ]
  if (record) crumbs.push({ label: pageLabel ?? '…' })
  return crumbs
}

function Page({ pathname, apps }: { pathname: string; apps: RegistryApp[] | null }) {
  // A record created at /new moves to its real URL after its first save.
  // It's the same form — keep it mounted (with its "Saved" state) rather
  // than letting the key change remount it. path → the key it inherited.
  const [aliases, setAliases] = useState<Record<string, string>>({})

  if (pathname === '/dev/gallery') return <FieldGallery />
  if (pathname === '/dev/schema') return <SchemaViewer />

  const list = LIST_ROUTE.exec(pathname)
  const record = RECORD_ROUTE.exec(pathname)
  const [, appLabel, model, id] = record ?? list ?? []
  if (!appLabel) return null

  // Only what the registry lists is a page. (Before the registry has
  // loaded, render optimistically: the renderers have their own errors.)
  if (apps && !findInRegistry(apps, appLabel, model)) return <NotFound />

  if (list) return <ListRenderer key={`${appLabel}/${model}`} appLabel={appLabel} model={model} />

  const key = aliases[pathname] ?? pathname
  return (
    <FormRenderer
      key={key}
      appLabel={appLabel}
      model={model}
      recordId={id === 'new' ? undefined : Number(id)}
      onSaved={(saved) => {
        if (id !== 'new') return
        const realPath = `/${appLabel}/${model}/${saved.id}`
        // Commit the alias before the URL changes, so the render the URL
        // change triggers already sees it and keeps the same key.
        flushSync(() => setAliases((current) => ({ ...current, [realPath]: key })))
        navigate(realPath, { replace: true, force: true })
      }}
    />
  )
}

function NotFound() {
  return (
    <div className="shell-message" role="alert">
      <h1 className="shell-message__title">Nothing here</h1>
      <p className="shell-message__text">This address doesn’t match any module in Clicker.</p>
    </div>
  )
}
