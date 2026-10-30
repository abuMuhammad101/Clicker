import { CircleAlert, Sigma } from 'lucide-react'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
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
      </label>
      <div className="field-shell__body">
        {readOnly ? (
          <div
            className={cn(
              'field-shell__readonly-value',
              readOnlyValue == null && 'field-shell__readonly-value--empty',
            )}
          >
            {readOnlyValue ?? '—'}
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

/** The small Σ beside a computed field's label, explained on hover or focus. */
export function CalculatedMark({ description }: { description: string }) {
  return (
    <TooltipProvider>
      <Tooltip label={`Calculated: ${description}`} side="top">
        <span className="calculated-mark" tabIndex={0} aria-label={`Calculated: ${description}`}>
          <Sigma aria-hidden />
        </span>
      </Tooltip>
    </TooltipProvider>
  )
}
