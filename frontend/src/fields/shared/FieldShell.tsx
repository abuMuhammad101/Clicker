import { CircleAlert, LockKeyhole, Sigma, type LucideIcon } from 'lucide-react'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import { useContext, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AssignedNoteContext, WriteOnceNoteContext } from './fieldNotes'
import './FieldShell.css'

interface FieldShellProps {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  helpText?: string
  readOnly?: boolean
  /** True once this field's value differs from what the form loaded with. */
  dirty?: boolean
  /** Pre-formatted display value used only when readOnly is true. */
  readOnlyValue?: ReactNode
  /**
   * A computed field: shown read-only with a small "calculated" mark whose
   * tooltip says what it's calculated from ("Sales price − Cost").
   * Feedforward, not mystery: a value nobody can type should say why.
   */
  computed?: { description: string }
  children: ReactNode
}

export function FieldShell({
  label,
  htmlFor,
  required,
  error,
  helpText,
  readOnly,
  dirty,
  readOnlyValue,
  computed,
  children,
}: FieldShellProps) {
  // A computed field is never editable, whatever the caller says.
  readOnly = readOnly || computed != null
  // A write-once field says its rule while it's still editable (creating)
  // and after it isn't: feedforward, so nobody meets the lock by surprise.
  const writeOnce = useContext(WriteOnceNoteContext)
  const assigned = useContext(AssignedNoteContext)
  return (
    <div className="field-shell">
      <label
        htmlFor={htmlFor}
        className={cn('field-shell__label', readOnly && 'field-shell__label--readonly')}
      >
        {dirty && <span className="field-shell__dirty-dot" aria-hidden="true" />}
        {label}
        {required && !readOnly && <span className="field-shell__required">*</span>}
        {computed && <CalculatedMark description={computed.description} />}
        {writeOnce && <FieldMark icon={LockKeyhole} label={writeOnce} />}
      </label>
      <div className="field-shell__body">
        {readOnly ? (
          <div
            className={cn(
              'field-shell__readonly-value',
              readOnlyValue == null && 'field-shell__readonly-value--empty',
            )}
          >
            {readOnlyValue ?? assigned ?? '—'}
          </div>
        ) : (
          children
        )}
        {error ? (
          <p className="field-shell__message field-shell__message--error" role="alert">
            <CircleAlert className="field-shell__message-icon" aria-hidden="true" />
            {error}
          </p>
        ) : helpText && !readOnly ? (
          <p className="field-shell__message field-shell__message--help">{helpText}</p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * A small mark beside a field's label that explains itself on hover or
 * keyboard focus: why this field behaves differently from its neighbours.
 */
export function FieldMark({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <TooltipProvider>
      <Tooltip label={label} side="top">
        <span className="field-mark" tabIndex={0} aria-label={label}>
          <Icon aria-hidden />
        </span>
      </Tooltip>
    </TooltipProvider>
  )
}

/** The small Σ beside a computed field's label. */
export function CalculatedMark({ description }: { description: string }) {
  return <FieldMark icon={Sigma} label={`Calculated: ${description}`} />
}
