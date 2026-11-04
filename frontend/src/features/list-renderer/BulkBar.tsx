import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ManyToOneField } from '@/fields/many-to-one/ManyToOneField'
import { ApiError, apiSend } from '@/lib/api'
import { toast } from '@/lib/toast'
import type { BulkAction, ModelSchema } from '@/types/schema'
import './BulkBar.css'

/**
 * What can be done to the rows that are ticked (Schema.bulk_actions): set one
 * field on all of them, through the field's own picker, all or none. The
 * schema says which actions this user has at all; nothing here knows a model.
 */
export function BulkBar({
  appLabel,
  model,
  schema,
  selected,
  onClear,
  onDone,
}: {
  appLabel: string
  model: string
  schema: ModelSchema
  selected: number[]
  onClear: () => void
  onDone: () => void
}) {
  const actions = schema.list.bulk_actions ?? []
  const [open, setOpen] = useState<BulkAction | null>(null)
  const [value, setValue] = useState<number | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const count = selected.length
  const noun = count === 1 ? schema.verbose_name : schema.verbose_name_plural

  const close = () => {
    setOpen(null)
    setValue(null)
    setLabel(null)
    setError(null)
  }

  const apply = async () => {
    if (!open || value == null) return
    setBusy(true)
    setError(null)
    try {
      const result = await apiSend<{ updated: number }>('POST', `/data/${appLabel}/${model}/bulk/${open.key}/`, {
        ids: selected,
        value,
      })
      toast({ message: `${open.label}: ${result.updated} ${result.updated === 1 ? schema.verbose_name : schema.verbose_name_plural} updated${label ? ` — ${label}` : ''}` })
      close()
      onClear()
      onDone()
    } catch (problem) {
      setError(problem instanceof ApiError ? (problem.validation?.value?.[0] ?? problem.message) : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const field = open ? schema.fields[open.field] : null
  return (
    <>
      <div className="bulk-bar" role="region" aria-label="Selected rows">
        <span className="bulk-bar__count">
          {count} {noun} selected
        </span>
        {actions.map((action) => (
          <Button key={action.key} variant="outline" className="h-[var(--control-height)]" onClick={() => setOpen(action)}>
            {action.label}
          </Button>
        ))}
        <Button variant="ghost" className="h-[var(--control-height)]" onClick={onClear}>
          Clear
        </Button>
      </div>

      <Dialog open={open != null} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {open?.label} for {count} {noun}
            </DialogTitle>
            <DialogDescription>Applies to every selected {schema.verbose_name} or none of them.</DialogDescription>
          </DialogHeader>
          {open && field && (
            <ManyToOneField
              name={`bulk-${open.field}`}
              label={field.label}
              value={value}
              person={field.person}
              target={field.target!}
              domain={field.domain ? Object.fromEntries(Object.entries(field.domain).map(([k, v]) => [k, String(v)])) : undefined}
              onChange={(next) => {
                setValue(typeof next === 'number' ? next : null)
                setError(null)
              }}
              displayValue={label}
              error={error ?? undefined}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Go back
            </Button>
            <Button disabled={value == null || busy} onClick={() => void apply()}>
              {busy ? 'Applying…' : open?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
