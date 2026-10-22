import { useEffect, useRef, useState } from 'react'
import { isValidDecimalInput, parseDecimalInput } from '@/fields/decimal/decimalFormat'
import type { FieldSchema } from '@/types/schema'

interface InlineEditorProps {
  field: FieldSchema
  value: unknown
  /** Enter, or leaving the cell. Receives the new value in the type the API expects. */
  onCommit: (value: string | number | null) => void
  /** Escape. Nothing was changed. */
  onCancel: () => void
}

/**
 * One input, sized to the cell. Enter or blur commits, Escape reverts. It
 * knows the field's type and nothing else: not the model, not the record.
 */
export function InlineEditor({ field, value, onCommit, onCancel }: InlineEditorProps) {
  const [raw, setRaw] = useState(value == null ? '' : String(value))
  const input = useRef<HTMLInputElement>(null)
  // Enter and blur both commit; this stops the pair from committing twice.
  const done = useRef(false)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (!commit) return onCancel()
    if (field.type === 'decimal' || field.type === 'integer') return onCommit(parseDecimalInput(raw))
    onCommit(raw.trim() === '' ? null : raw.trim())
  }

  const numeric = field.type === 'decimal' || field.type === 'integer'
  return (
    <input
      ref={input}
      className="list-inline-input"
      value={raw}
      inputMode={field.type === 'decimal' ? 'decimal' : field.type === 'integer' ? 'numeric' : undefined}
      aria-label={field.label}
      onChange={(event) => {
        const next = event.target.value
        if (field.type === 'decimal' && !isValidDecimalInput(next, field.max_digits ?? 18, field.decimal_places ?? 2)) return
        if (field.type === 'integer' && !isValidDecimalInput(next, field.max_digits ?? 18, 0)) return
        setRaw(next)
      }}
      onKeyDown={(event) => {
        // Keys here belong to the input, never to the row it sits in.
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          finish(false)
        }
      }}
      onBlur={() => finish(true)}
      data-numeric={numeric}
    />
  )
}
