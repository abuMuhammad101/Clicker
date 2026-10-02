import { useCallback, useState } from 'react'
import { flushSync } from 'react-dom'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormRenderer } from '@/features/form-renderer/FormRenderer'
import {
  currentLocation,
  navigate,
  NavigationScopeContext,
  useLocation,
} from '@/lib/router'
import { openRecord, sameTarget, useSurface, type RecordTarget } from '@/records'
import { findInRegistry, type RegistryApp } from '@/shell/useRegistry'
import { encodeTarget, MAX_PEEK_DEPTH, peekUrl, readPeekStack } from './peekUrl'
import { peekScope } from './peekScope'
import './peek.css'

/**
 * The peek surface: a drawer over whatever is on screen.
 *
 * It is a container, nothing more. It registers itself as the `peek` surface,
 * keeps its stack in the URL (see peekUrl.ts), and puts an unmodified
 * FormRenderer in each layer. The screen behind stays mounted — dirty state,
 * scroll, search and all — because opening a peek changes a query param, not
 * the page.
 *
 * Decisions, in one place:
 *
 *  - Read-only first. An existing record opens in `view` mode; "Edit" is an
 *    explicit step, and one-way: going back to view with unsaved edits would
 *    leave them with no way to be saved. A new record opens straight in edit.
 *  - Escape closes the whole peek; the back arrow closes one layer. Neither
 *    can lose work: both are navigations, so an unsaved layer's own
 *    leave-dialog (Save / Discard / Cancel) stands in the way.
 *  - Depth is capped at MAX_PEEK_DEPTH. Past the cap, a new peek replaces the
 *    top layer (guarded like any other close) rather than being refused.
 *  - Lower layers stay mounted but hidden, so going back finds them as they
 *    were, edits included.
 *  - One live view per record. Asking for a record that's already in the
 *    stack pops back to it instead of stacking a duplicate; asking for the
 *    record the page is showing reveals the page. See records/surfaces.ts.
 */
export function PeekHost({ apps }: { apps: RegistryApp[] | null }) {
  const { pathname, search } = useLocation()
  const stack = readPeekStack(search)

  // Layers that a created record has moved on from `new` for: the key it
  // started with, so the form isn't remounted when its URL entry changes.
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())
  const [labels, setLabels] = useState<Record<string, string | null>>({})

  const keyFor = (target: RecordTarget, index: number) => {
    const encoded = encodeTarget(target)
    return `${index}:${aliases[encoded] ?? encoded}`
  }

  useSurface('peek', {
    open: (target) => {
      const location = currentLocation()
      const current = readPeekStack(location.search)
      const next =
        current.length >= MAX_PEEK_DEPTH
          ? [...current.slice(0, MAX_PEEK_DEPTH - 1), target]
          : [...current, target]
      navigate(peekUrl(location.pathname, location.search, next))
    },
    holds: (target) => readPeekStack(currentLocation().search).some((entry) => sameTarget(entry, target)),
    reveal: (target) => {
      const location = currentLocation()
      const current = readPeekStack(location.search)
      const index = current.findIndex((entry) => sameTarget(entry, target))
      if (index >= 0 && index < current.length - 1) {
        navigate(peekUrl(location.pathname, location.search, current.slice(0, index + 1)), {
          replace: true,
        })
      }
    },
  })

  const setLabel = useCallback((key: string, label: string | null) => {
    setLabels((current) => (current[key] === label ? current : { ...current, [key]: label }))
  }, [])

  if (stack.length === 0) return null

  const depth = stack.length
  const top = stack[depth - 1]
  const topKey = keyFor(top, depth - 1)
  const below = depth > 1 ? keyFor(stack[depth - 2], depth - 2) : null
  const topIsNew = top.id === 'new'
  const topEditing = topIsNew || editing.has(topKey)
  const found = apps ? findInRegistry(apps, top.app_label, top.model) : null

  const popTo = (next: RecordTarget[]) =>
    navigate(peekUrl(pathname, search, next), { replace: true })
  const close = () => popTo([])
  const openAsPage = () => {
    if (!topIsNew) openRecord(top, top.id, { surface: 'page', takeover: true })
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="peek__scrim" />
        <DialogPrimitive.Content
          className="peek"
          aria-describedby={undefined}
          onKeyDown={(event) => {
            // Scoped to the drawer, not the window: it only exists while a
            // peek has focus.
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              openAsPage()
            }
          }}
        >
          <header className="peek__bar">
            {below ? (
              <button
                type="button"
                className="peek__back"
                onClick={() => popTo(stack.slice(0, -1))}
                title="Back"
              >
                <ArrowLeft className="size-4" aria-hidden />
                <span className="peek__back-label">{labels[below] ?? 'Back'}</span>
              </button>
            ) : (
              <span className="peek__kind">{found?.model.label_singular ?? top.model}</span>
            )}
            <DialogPrimitive.Title className="sr-only">
              {labels[topKey] ?? found?.model.label_singular ?? 'Record'}
            </DialogPrimitive.Title>
            {depth > 1 && (
              <span className="peek__depth" title={`Peek ${depth} of ${MAX_PEEK_DEPTH}`}>
                {depth}/{MAX_PEEK_DEPTH}
              </span>
            )}
            <span className="peek__spacer" />
            {!topEditing && (
              <Button
                variant="outline"
                onClick={() => setEditing((current) => new Set(current).add(topKey))}
                className="h-[var(--control-height-sm)] px-[var(--control-padding-x)] text-[length:var(--text-sm)]"
              >
                Edit
              </Button>
            )}
            {!topIsNew && (
              <Button
                variant="ghost"
                onClick={openAsPage}
                className="h-[var(--control-height-sm)] gap-[var(--space-3)] px-[var(--control-padding-x)] text-[length:var(--text-sm)]"
              >
                Open as page
                <kbd className="peek__kbd">{shortcutHint()}</kbd>
              </Button>
            )}
            <button type="button" className="peek__close" onClick={close} aria-label="Close" title="Close (Esc)">
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="peek__body">
            {stack.map((target, index) => {
              const key = keyFor(target, index)
              const isTop = index === depth - 1
              return (
                <NavigationScopeContext.Provider key={key} value={peekScope(index + 1)}>
                  <PeekLayer
                    layerKey={key}
                    target={target}
                    visible={isTop}
                    mode={target.id === 'new' || editing.has(key) ? 'edit' : 'view'}
                    onLabel={setLabel}
                    onCreated={(saved) => {
                      // The new record keeps its form (and its "Saved" state):
                      // alias its new URL entry to the key it started with,
                      // commit that before the URL changes, then swap it in.
                      const real: RecordTarget = { ...target, id: saved.id }
                      flushSync(() => {
                        setAliases((c) => ({ ...c, [encodeTarget(real)]: aliases[encodeTarget(target)] ?? encodeTarget(target) }))
                        setEditing((c) => new Set(c).add(key))
                      })
                      popTo(stack.map((entry, i) => (i === index ? real : entry)))
                    }}
                  />
                </NavigationScopeContext.Provider>
              )
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PeekLayer({
  layerKey,
  target,
  visible,
  mode,
  onLabel,
  onCreated,
}: {
  layerKey: string
  target: RecordTarget
  visible: boolean
  mode: 'edit' | 'view'
  onLabel: (key: string, label: string | null) => void
  onCreated: (saved: { id: number }) => void
}) {
  // The form's label effect depends on this staying the same function.
  const onLabelChange = useCallback((label: string | null) => onLabel(layerKey, label), [onLabel, layerKey])
  return (
    <div className="peek__layer" hidden={!visible}>
      <FormRenderer
        appLabel={target.app_label}
        model={target.model}
        recordId={target.id === 'new' ? undefined : target.id}
        mode={mode}
        onLabelChange={onLabelChange}
        onSaved={(saved) => {
          if (target.id === 'new') onCreated(saved)
        }}
      />
    </div>
  )
}

function shortcutHint() {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return mac ? '⌘↵' : 'Ctrl+↵'
}
