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
  children,
}: FieldShellProps) {
  return (
    <div className="field-shell">
      <label
        htmlFor={htmlFor}
        className={cn('field-shell__label', readOnly && 'field-shell__label--readonly')}
      >
        {dirty && <span className="field-shell__dirty-dot" aria-hidden="true" />}
        {label}
        {required && <span className="field-shell__required">*</span>}
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
          <p className="field-shell__message field-shell__message--error">{error}</p>
        ) : helpText ? (
          <p className="field-shell__message field-shell__message--help">{helpText}</p>
        ) : null}
      </div>
    </div>
  )
}
