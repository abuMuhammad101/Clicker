/**
 * A write-once field (set on create, read-only after) tells the person its
 * rule in both forms: while they can still set it, and after they can't.
 * Rendered through the registry, the same path the form renderer uses.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { FieldSchema } from '@/types/schema'
import { renderFormField } from './registry'

const NOTE = 'Set when the record is created. Ask a Manager to change it.'

const taxId = (readOnly: boolean): FieldSchema => ({
  type: 'text',
  label: 'Tax ID',
  required: false,
  read_only: readOnly,
  visible_when: null,
  write_once: { note: NOTE },
})

const render = (schema: FieldSchema, value: string | null) =>
  renderToStaticMarkup(
    <>{renderFormField({ name: 'tax_id', schema, value, displayValue: null, onChange: () => {} })}</>,
  )

describe('write-once field', () => {
  it('is editable when creating, and already states the rule', () => {
    const markup = render(taxId(false), null)
    expect(markup).toContain('<input')
    expect(markup).toContain(`aria-label="${NOTE}"`)
  })

  it('is read-only afterwards, with the same rule on the mark', () => {
    const markup = render(taxId(true), 'NTN-1234567')
    expect(markup).not.toContain('<input')
    expect(markup).toContain('NTN-1234567')
    expect(markup).toContain(`aria-label="${NOTE}"`)
  })

  it('an ordinary field carries no mark', () => {
    const { write_once: _ignored, ...plain } = taxId(false)
    expect(render(plain, null)).not.toContain(NOTE)
  })
})
