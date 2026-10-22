import { useEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { isValidDecimalInput, parseDecimalInput } from '@/fields/decimal/decimalFormat'
import type { FieldSchema } from '@/types/schema'

interface InlineEditorProps {
  field: FieldSchema
  value: unknown
  /** Enter, Save, or leaving the cell. Receives the new value in the type the API expects. */
  onCommit: (value: string | number | null) => void
  /** Escape or Cancel. Nothing was changed. */
  onCancel: () => void
}

/**
 * One input, sized to the cell, with its two ways out stated underneath:
 * Cancel (Esc) and Save (Enter). Leaving the cell also saves, so a change is
 * never lost silently. It knows the field's type and nothing else: not the
 * model, not the record.
 */
export function InlineEditor({ field, value, onCommit, onCancel }: InlineEditorProps) {
  const [raw, setRaw] = useState(value == null ? '' : String(value))
  const input = useRef<HTMLInputElement>(null)
  // Enter, a button and blur can all end the edit; only the first counts.
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
  // The buttons must not take focus from the input, or blur would save first.
  const keepFocus = (event: React.MouseEvent) => event.preventDefault()

  return (
    <>
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
      <div className="list-inline-actions" role="group" aria-label="Finish editing">
        <button type="button" className="list-inline-actions__button" onMouseDown={keepFocus} onClick={() => finish(false)}>
          <X aria-hidden /> Cancel <kbd className="kbd">esc</kbd>
        </button>
        <button
          type="button"
          className="list-inline-actions__button list-inline-actions__button--primary"
          onMouseDown={keepFocus}
          onClick={() => finish(true)}
        >
          <Check aria-hidden /> Save <kbd className="kbd">↵</kbd>
        </button>
      </div>
    </>
  )
}
