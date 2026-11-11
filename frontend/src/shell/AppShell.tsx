import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { User } from '@/features/auth/authContext'
import { FormRenderer } from '@/features/form-renderer/FormRenderer'
import { ListRenderer } from '@/features/list-renderer/ListRenderer'
import { SchemaViewer } from '@/features/schema-viewer/SchemaViewer'
import { DesignTokens } from '@/gallery/DesignTokens'
import { FieldGallery } from '@/gallery/FieldGallery'
import type { FormState } from '@/features/form-renderer/FormRenderer'
import { ViewAsBanner } from '@/features/view-as/ViewAsBanner'
import { PeekHost } from '@/surfaces/PeekHost'
import { LIST_STATE_KEYS, listStateFromSearch, listStateToSearch } from '@/lib/listQuery'
import { navigate, useLocation } from '@/lib/router'
import { parseListPath, parseRecordPath, recordPath, sameTarget, useSurface } from '@/records'
import { ArrowLeft, Compass } from 'lucide-react'
import { StatePanel } from '@/components/StatePanel'
import { Toaster } from '@/components/Toaster'
import { Button } from '@/components/ui/button'
import { Link } from '@/lib/Link'
import { toast } from '@/lib/toast'
import { useOnline } from '@/lib/useOnline'
import { RecentsPage } from './RecentsPage'
import { Sidebar } from './Sidebar'
import { TopBar, type Crumb } from './TopBar'
import { usePreference } from '@/lib/usePreference'
import { findInRegistry, useRegistry, type RegistryApp } from './useRegistry'
import './shell.css'

//   /                        → the first model in the registry
//   /<app>/<model>           list
//   /<app>/<model>/<id>      record
//   /<app>/<model>/new       new record
//   /dev/gallery, /dev/schema  developer pages (not in the nav)
const DEV_PAGES: Record<string, string> = {
  '/dev/gallery': 'Field gallery',
  '/dev/tokens': 'Design tokens',
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
  const { pathname, search } = useLocation()
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
        <ViewAsBanner />
        <TopBar
          crumbs={breadcrumbs(pathname, apps, pageLabel)}
          user={user}
          unsaved={pageForm?.dirty ? pageForm : null}
        />
        <OfflineBanner />
        <main className="app-shell__page">
          <Page
            pathname={pathname}
            search={search}
            apps={apps}
            user={user}
            onLabelChange={setPageLabel}
            onFormState={setPageForm}
          />
        </main>
      </div>
      <PeekHost apps={apps} />
      <Toaster />
    </div>
  )
}

function breadcrumbs(pathname: string, apps: RegistryApp[] | null, pageLabel: string | null): Crumb[] {
  if (pathname === '/') return [{ label: 'Recent' }]
  if (DEV_PAGES[pathname]) return [{ label: 'Developer' }, { label: DEV_PAGES[pathname] }]

  const record = parseRecordPath(pathname)
  const list = record ? null : parseListPath(pathname)
  const target = record ?? list
  if (!target) return [{ label: 'Not found' }]
  if (!apps) return []

  const found = findInRegistry(apps, target.app_label, target.model)
  if (!found) return [{ label: 'Not found' }]

  // A module that is named for its one model ("Contacts > Contacts") says it
  // once. The model crumb stays: it's the way back up to the list.
  const crumbs: Crumb[] =
    found.app.label.toLowerCase() === found.model.label.toLowerCase()
      ? [{ label: found.model.label, to: found.model.route }]
      : [{ label: found.app.label }, { label: found.model.label, to: found.model.route }]
  if (record) crumbs.push({ label: pageLabel ?? '…' })
  return crumbs
}

function Page({
  pathname,
  search,
  apps,
  user,
  onLabelChange,
  onFormState,
}: {
  pathname: string
  search: string
  apps: RegistryApp[] | null
  user: User
  onLabelChange: (label: string | null) => void
  onFormState: (state: FormState | null) => void
}) {
  // A record created at /new moves to its real URL after its first save.
  // It's the same form — keep it mounted (with its "Saved" state) rather
  // than letting the key change remount it. path → the key it inherited.
  const [aliases, setAliases] = useState<Record<string, string>>({})

  if (pathname === '/') return <RecentsPage user={user} apps={apps} onLabelChange={onLabelChange} />
  if (pathname === '/dev/gallery') return <FieldGallery />
  if (pathname === '/dev/tokens') return <DesignTokens />
  if (pathname === '/dev/schema') return <SchemaViewer />

  const record = parseRecordPath(pathname)
  const list = record ? null : parseListPath(pathname)
  const target = record ?? list
  // An address with no list or record shape (/foo, /a/b/c/d) is no page either, never a blank screen.
  if (!target) return <NotFound pathname={pathname} onLabelChange={onLabelChange} />
  const { app_label: appLabel, model } = target

  // Only what the registry lists is a page. (Before the registry has
  // loaded, render optimistically: the renderers have their own errors.)
  if (apps && !findInRegistry(apps, appLabel, model)) return <NotFound pathname={pathname} onLabelChange={onLabelChange} />

  // Everything in the query except the peek stack and a list's own state
  // (filters, sort, grouping, view: `listState…`): a list's exact-match
  // filters (`?parent=5`, from a related list's "View all"), or a new
  // record's prefilled values. Nothing here knows any field name.
  const params = new URLSearchParams(search)
  const owned = new Set<string>(['peek', ...(record ? [] : LIST_STATE_KEYS)])
  const query = Object.fromEntries([...params].filter(([key]) => !owned.has(key)))
  const hasQuery = Object.keys(query).length > 0

  if (!record) {
    // The list's state lives in the URL, so a filtered, grouped list can be
    // shared as a link and comes back on reload. The list only reports it.
    return (
      <ListRenderer
        key={`${appLabel}/${model}?${new URLSearchParams(query).toString()}`}
        appLabel={appLabel}
        model={model}
        onLabelChange={onLabelChange}
        filter={hasQuery ? query : undefined}
        onClearFilter={hasQuery ? () => navigate(`${pathname}?${listStateToSearch(listStateFromSearch(params))}`) : undefined}
        state={listStateFromSearch(params)}
        onStateChange={(next) => {
          const query = listStateToSearch(next, new URLSearchParams(window.location.search)).toString()
          navigate(`${pathname}${query ? `?${query}` : ''}`, { replace: true })
        }}
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
        prefill={id === 'new' && hasQuery ? query : undefined}
        onLabelChange={onLabelChange}
        onStateChange={onFormState}
        actions="external"
        onSaved={(saved) => {
          toast({ message: `Saved ${saved.display}` })
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

/** System state that stays visible for as long as it's true. */
function OfflineBanner() {
  const online = useOnline()
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!online) wasOffline.current = true
    else if (wasOffline.current) {
      wasOffline.current = false
      toast({ message: 'Back online' })
    }
  }, [online])

  if (online) return null
  return (
    <div className="offline-banner" role="status">
      You’re offline. Changes can’t be saved until your connection is back.
    </div>
  )
}

/**
 * An address that is no page: mistyped, an old link, or a module this role doesn't have (the registry lists only
 * what the user may open, so the two look the same here, and saying which would tell them what exists). It says
 * the address back, so a typo is seen, and offers the two ways on: back where you were, or home.
 */
function NotFound({ pathname, onLabelChange }: { pathname: string; onLabelChange: (label: string | null) => void }) {
  useEffect(() => onLabelChange('Not found'), [onLabelChange])
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1
  return (
    <StatePanel
      icon={Compass}
      mark="404"
      className="state-panel--page"
      title="Nothing at this address"
      message={
        <>
          No page in Clicker lives at <code className="state-panel__path">{pathname}</code>, or it isn’t one your
          role can open.
        </>
      }
    >
      {canGoBack && (
        <Button variant="outline" className="h-[var(--control-height)]" onClick={() => window.history.back()}>
          <ArrowLeft className="size-4" aria-hidden />
          Go back
        </Button>
      )}
      <Button asChild className="h-[var(--control-height)]">
        <Link to="/">Open Recent</Link>
      </Button>
    </StatePanel>
  )
}
