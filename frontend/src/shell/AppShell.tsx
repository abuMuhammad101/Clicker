import { useCallback, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { User } from '@/features/auth/authContext'
import { FormRenderer } from '@/features/form-renderer/FormRenderer'
import { ListRenderer } from '@/features/list-renderer/ListRenderer'
import { SchemaViewer } from '@/features/schema-viewer/SchemaViewer'
import { FieldGallery } from '@/gallery/FieldGallery'
import type { FormState } from '@/features/form-renderer/FormRenderer'
import { PeekHost } from '@/surfaces/PeekHost'
import { navigate, useLocation } from '@/lib/router'
import { parseListPath, parseRecordPath, recordPath, sameTarget, useSurface } from '@/records'
import { RecentsPage } from './RecentsPage'
import { Sidebar } from './Sidebar'
import { TopBar, type Crumb } from './TopBar'
import { usePreference } from './usePreference'
import { findInRegistry, useRegistry, type RegistryApp } from './useRegistry'
import './shell.css'

//   /                        → the first model in the registry
//   /<app>/<model>           list
//   /<app>/<model>/<id>      record
//   /<app>/<model>/new       new record
//   /dev/gallery, /dev/schema  developer pages (not in the nav)
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
  // The page's form, reported by the form itself. While it's dirty the top
  // bar becomes a save bar; a peek over this page has its own.
  const [pageForm, setPageForm] = useState<FormState | null>(null)

  // Which sidebar sections are folded shut: per user, on the server.
  const sections = usePreference<{ folded: string[] }>('sidebar.sections', { folded: [] })
  const folded = sections.value.folded
  const toggleSection = useCallback(
    (appLabel: string) =>
      sections.set((current) => ({
        folded: current.folded.includes(appLabel)
          ? current.folded.filter((entry) => entry !== appLabel)
          : [...current.folded, appLabel],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections.set],
  )
  // The section holding the current view opens when you navigate into it.
  // Keyed on the app, not the fold state, so folding it yourself while
  // you're there sticks until you next arrive from somewhere else.
  const currentApp = (parseRecordPath(pathname) ?? parseListPath(pathname))?.app_label ?? null
  const sectionsReady = sections.ready
  const setSections = sections.set
  useEffect(() => {
    if (!currentApp || !sectionsReady) return
    setSections((current) =>
      current.folded.includes(currentApp)
        ? { folded: current.folded.filter((entry) => entry !== currentApp) }
        : current,
    )
  }, [currentApp, sectionsReady, setSections])

  // The shell is the `page` surface: opening a record there means making it
  // the current location. It also owns the window title, which the renderers
  // used to set for themselves.
  useSurface('page', {
    open: (target) => navigate(recordPath(target)),
    holds: (target) => {
      const here = parseRecordPath(pathname)
      return here != null && sameTarget(here, target)
    },
    reveal: () => navigate(pathname),
  })
  useEffect(() => {
    document.title = pageLabel ? `${pageLabel} · Clicker` : 'Clicker'
  }, [pageLabel])

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

  const apps = registry.status === 'ready' ? registry.apps : null

  return (
    <div className="app-shell">
      <Sidebar
        registry={registry}
        onRetry={retry}
        pathname={pathname}
        collapsed={collapsed}
        onToggle={toggle}
        foldedSections={folded}
        onToggleSection={toggleSection}
      />
      <div className="app-shell__main">
        <TopBar
          crumbs={breadcrumbs(pathname, apps, pageLabel)}
          user={user}
          unsaved={pageForm?.dirty ? pageForm : null}
        />
        <main className="app-shell__page">
          <Page pathname={pathname} apps={apps} onLabelChange={setPageLabel} onFormState={setPageForm} />
        </main>
      </div>
      <PeekHost apps={apps} />
    </div>
  )
}

function breadcrumbs(pathname: string, apps: RegistryApp[] | null, pageLabel: string | null): Crumb[] {
  if (pathname === '/') return [{ label: 'Recent' }]
  if (DEV_PAGES[pathname]) return [{ label: 'Developer' }, { label: DEV_PAGES[pathname] }]

  const record = parseRecordPath(pathname)
  const list = record ? null : parseListPath(pathname)
  const target = record ?? list
  if (!target || !apps) return []

  const found = findInRegistry(apps, target.app_label, target.model)
  if (!found) return [{ label: 'Not found' }]

  const crumbs: Crumb[] = [
    { label: found.app.label },
    { label: found.model.label, to: found.model.route },
  ]
  if (record) crumbs.push({ label: pageLabel ?? '…' })
  return crumbs
}

function Page({
  pathname,
  apps,
  onLabelChange,
  onFormState,
}: {
  pathname: string
  apps: RegistryApp[] | null
  onLabelChange: (label: string | null) => void
  onFormState: (state: FormState | null) => void
}) {
  // A record created at /new moves to its real URL after its first save.
  // It's the same form — keep it mounted (with its "Saved" state) rather
  // than letting the key change remount it. path → the key it inherited.
  const [aliases, setAliases] = useState<Record<string, string>>({})

  if (pathname === '/') return <RecentsPage onLabelChange={onLabelChange} />
  if (pathname === '/dev/gallery') return <FieldGallery />
  if (pathname === '/dev/schema') return <SchemaViewer />

  const record = parseRecordPath(pathname)
  const list = record ? null : parseListPath(pathname)
  const target = record ?? list
  if (!target) return null
  const { app_label: appLabel, model } = target

  // Only what the registry lists is a page. (Before the registry has
  // loaded, render optimistically: the renderers have their own errors.)
  if (apps && !findInRegistry(apps, appLabel, model)) return <NotFound />

  if (!record) {
    return (
      <ListRenderer
        key={`${appLabel}/${model}`}
        appLabel={appLabel}
        model={model}
        onLabelChange={onLabelChange}
      />
    )
  }

  const id = record.id
  const key = aliases[pathname] ?? pathname
  return (
    // The page is what puts a form on a sunken sheet with room around it.
    <div className="record-page">
      <FormRenderer
        key={key}
        appLabel={appLabel}
        model={model}
        recordId={id === 'new' ? undefined : id}
        onLabelChange={onLabelChange}
        onStateChange={onFormState}
        actions="external"
        onSaved={(saved) => {
          if (id !== 'new') return
          const realPath = recordPath({ ...record, id: saved.id })
          // Commit the alias before the URL changes, so the render the URL
          // change triggers already sees it and keeps the same key.
          flushSync(() => setAliases((current) => ({ ...current, [realPath]: key })))
          navigate(realPath, { replace: true, force: true })
        }}
      />
    </div>
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
