import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ModelSchema } from '@/types/schema'
import { ActivityList, type ActivityEntry } from './ActivityTrail'

const schema = {
  verbose_name: 'bill',
  workflow: {
    field: 'state',
    states: [],
    path: [],
    locked: [],
    transitions: [],
  },
  fields: {
    due_date: { type: 'date', label: 'Due date', required: false, read_only: false, visible_when: null },
    state: {
      type: 'selection',
      label: 'State',
      required: true,
      read_only: true,
      visible_when: null,
      choices: [
        { value: 'draft', label: 'Draft' },
        { value: 'posted', label: 'Posted' },
      ],
    },
    customer: { type: 'many_to_one', label: 'Customer', required: true, read_only: false, visible_when: null },
  },
} as unknown as Pick<ModelSchema, 'fields' | 'workflow' | 'verbose_name'>

const entry = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
  id: 1,
  timestamp: '2026-11-03T09:00:00Z',
  action: 'update',
  summary: '',
  actor: { id: 1, display_name: 'Ayesha Khan' },
  changes: {},
  ...overrides,
})

const html = (entries: ActivityEntry[], status: 'loading' | 'error' | 'ready' = 'ready') =>
  renderToStaticMarkup(<ActivityList entries={entries} schema={schema} status={status} />)

describe('ActivityList', () => {
  it('says who changed what, before and after, in the field’s own format', () => {
    const text = html([entry({ changes: { due_date: { before: '2026-01-16', after: '2026-01-30' } } })])
    expect(text).toContain('Ayesha Khan')
    expect(text).toContain('Due date')
    expect(text).toContain('16 Jan 2026')
    expect(text).toContain('30 Jan 2026')
  })

  it('writes a move as the states it went between, by their names', () => {
    const text = html([entry({ action: 'transition', changes: { state: { before: 'draft', after: 'posted' } } })])
    expect(text).toMatch(/moved.*Draft.*Posted/)
  })

  it('formats an amount in a summary in the reader’s money format', () => {
    const text = html([entry({ summary: 'Payment PAY-2026-00012 allocated {money:420000.00}' })])
    expect(text).toContain('Payment PAY-2026-00012 allocated')
    expect(text).toContain('Rs 420,000.00')
    expect(text).not.toContain('{money')
  })

  it('names a linked record from its label and never shows a bare id', () => {
    const text = html([
      entry({ changes: { customer: { before: 3, after: 7, before_label: 'Acme (demo)', after_label: 'Globex (demo)' } } }),
    ])
    expect(text).toContain('Acme (demo)')
    expect(text).toContain('Globex (demo)')
    expect(html([entry({ changes: { customer: { before: 3, after: 7 } } })])).toContain('a record you can’t see')
  })

  it('skips a change to a field the reader has no schema for', () => {
    const text = html([entry({ changes: { secret_field: { before: 'a', after: 'b' } } })])
    expect(text).not.toContain('secret_field')
    expect(text).toContain('saved this bill')
  })

  it('shows the newest few, then “Show all” with the count', () => {
    const many = Array.from({ length: 12 }, (_, id) => entry({ id, changes: { due_date: { before: null, after: '2026-02-02' } } }))
    const text = html(many)
    expect(text.match(/activity__entry/g)).toHaveLength(8)
    expect(text).toContain('Show all 12')
  })

  it('says so when there is nothing, and when it is loading or failed', () => {
    expect(html([])).toContain('Nothing has happened to this bill yet')
    expect(html([], 'loading')).toContain('aria-busy="true"')
    expect(html([], 'error')).toContain('role="alert"')
  })
})
