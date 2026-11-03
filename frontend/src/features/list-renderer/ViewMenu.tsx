import { useState } from 'react'
import { Check, ChevronDown, Layers, Plus, Save, Trash2, User, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import type { SavedView } from '@/lib/listQuery'
import { cn } from '@/lib/utils'
import './ViewMenu.css'

/**
 * The list's views: the module's own (Schema.views), the person's, and ones
 * colleagues shared. The active one names the page. When the list has moved
 * away from it, "Save as view" and (for your own) "Update view" appear.
 */
export function ViewMenu({
  plural,
  views,
  activeId,
  changed,
  onApply,
  onSave,
  onUpdate,
  onDelete,
  forceOpen,
}: {
  plural: string
  views: SavedView[] | null
  activeId: string | null
  changed: boolean
  onApply: (view: SavedView | null) => void
  onSave: (label: string, shared: boolean) => Promise<void>
  onUpdate: () => Promise<void>
  onDelete: (view: SavedView) => Promise<void>
  /** Gallery only. */
  forceOpen?: boolean
}) {
  const [openState, setOpen] = useState(false)
  const open = forceOpen || openState
  const [saving, setSaving] = useState(false)
  const active = views?.find((view) => view.id === activeId) ?? null
  const all = `All ${plural}`

  const sections: { title: string; icon: typeof Layers; items: SavedView[] }[] = [
    { title: 'Views', icon: Layers, items: views?.filter((v) => v.kind === 'module') ?? [] },
    { title: 'Your views', icon: User, items: views?.filter((v) => v.kind === 'personal') ?? [] },
    { title: 'Shared with you', icon: Users, items: views?.filter((v) => v.kind === 'shared') ?? [] },
  ]

  const pick = (view: SavedView | null) => {
    onApply(view)
    setOpen(false)
  }

  const trigger = (
    <button type="button" className={cn('view-menu__trigger', active && 'view-menu__trigger--active')}>
      <span className="view-menu__name">{active ? active.label : all}</span>
      {changed && <span className="view-menu__edited" title="Changed since this view was opened">Edited</span>}
      <ChevronDown className="view-menu__chevron" aria-hidden />
    </button>
  )
  const body = (
    <>
          <button type="button" className="view-menu__item" onClick={() => pick(null)}>
            <Check className={cn('view-menu__check', activeId !== null && 'invisible')} aria-hidden />
            <span className="view-menu__label">{all}</span>
          </button>
          {views === null ? (
            <div className="view-menu__loading" aria-busy="true">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          ) : (
            sections.map(
              ({ title, items }) =>
                items.length > 0 && (
                  <div key={title} className="view-menu__section" role="group" aria-label={title}>
                    <p className="view-menu__heading">{title}</p>
                    {items.map((view) => (
                      <div key={view.id} className="view-menu__row">
                        <button type="button" className="view-menu__item" onClick={() => pick(view)}>
                          <Check className={cn('view-menu__check', view.id !== activeId && 'invisible')} aria-hidden />
                          <span className="view-menu__label">{view.label}</span>
                          {view.owner && <span className="view-menu__owner">{view.owner}</span>}
                          {view.kind === 'personal' && view.shared && (
                            <Users className="view-menu__shared" aria-label="Shared" />
                          )}
                        </button>
                        {view.editable && (
                          <button
                            type="button"
                            className="view-menu__delete"
                            aria-label={`Delete view ${view.label}`}
                            title="Delete view"
                            onClick={() => void onDelete(view)}
                          >
                            <Trash2 aria-hidden />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ),
            )
          )}
          {views !== null && !views.some((v) => v.kind !== 'module') && (
            <p className="view-menu__empty">
              Filter, sort or group the list, then save it as a view to come back to it.
            </p>
          )}
          <div className="view-menu__actions">
            {active?.editable && changed && (
              <button
                type="button"
                className="view-menu__action"
                onClick={() => {
                  setOpen(false)
                  void onUpdate()
                }}
              >
                <Save aria-hidden />
                Update “{active.label}”
              </button>
            )}
            <button
              type="button"
              className="view-menu__action"
              onClick={() => {
                setOpen(false)
                setSaving(true)
              }}
            >
              <Plus aria-hidden />
              Save as view…
            </button>
          </div>
    </>
  )

  return (
    <>
      {forceOpen ? (
        // Gallery: the open menu drawn in place, so a page of examples can show several.
        <div className="view-menu__static">
          {trigger}
          <div className="view-menu view-menu--static">{body}</div>
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="start" className="view-menu">
            {body}
          </PopoverContent>
        </Popover>
      )}
      <SaveViewDialog
        open={saving}
        plural={plural}
        suggestion={active && changed ? `${active.label} (edited)` : ''}
        onClose={() => setSaving(false)}
        onSave={onSave}
      />
    </>
  )
}

function SaveViewDialog({
  open,
  plural,
  suggestion,
  onClose,
  onSave,
}: {
  open: boolean
  plural: string
  suggestion: string
  onClose: () => void
  onSave: (label: string, shared: boolean) => Promise<void>
}) {
  const [label, setLabel] = useState(suggestion)
  const [shared, setShared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastOpen, setLastOpen] = useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setLabel(suggestion)
      setShared(false)
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="view-dialog">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!label.trim()) {
              setError('Give the view a name.')
              return
            }
            setBusy(true)
            onSave(label.trim(), shared)
              .then(onClose)
              .catch((failure: unknown) => {
                setError(
                  failure instanceof ApiError
                    ? (failure.validation?.label?.[0] ?? failure.validation?.filter?.[0] ?? failure.message)
                    : 'Couldn’t save the view.',
                )
              })
              .finally(() => setBusy(false))
          }}
        >
          <DialogHeader>
            <DialogTitle>Save as view</DialogTitle>
            <DialogDescription>
              Keeps these filters, the sort, grouping, columns and row height under a name.
            </DialogDescription>
          </DialogHeader>
          <label className="view-dialog__field">
            <span className="view-dialog__label">Name</span>
            <input
              className="view-dialog__input"
              value={label}
              maxLength={80}
              autoFocus
              onChange={(event) => {
                setLabel(event.target.value)
                setError(null)
              }}
              placeholder="e.g. Overdue, Karachi"
              aria-invalid={!!error}
            />
          </label>
          {error && (
            <p className="view-dialog__error" role="alert">
              {error}
            </p>
          )}
          <label className="view-dialog__share">
            <Checkbox checked={shared} onCheckedChange={(value) => setShared(value === true)} />
            Share with everyone who can see {plural}
          </label>
          <p className="view-dialog__note">
            Anyone you share it with sees only what their own role allows.
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Save view
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
