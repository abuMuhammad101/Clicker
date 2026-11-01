/**
 * A placeholder must never look like data. An empty field and a field holding
 * zero must read differently everywhere: the editable field, the read-only
 * value (the peek), and the list cell. Rendered to HTML with React's own
 * server renderer, so the assertions are about what a person would see.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CurrencyField } from './currency/CurrencyField'
import { CurrencyListCell } from './currency/CurrencyListCell'
import { DateField } from './date/DateField'
import { IntegerField } from './integer/IntegerField'
import { IntegerListCell } from './integer/IntegerListCell'
import { emptyPrompt } from './shared/types'

const html = (node: React.ReactElement) => renderToStaticMarkup(node)
const placeholderOf = (markup: string) => /placeholder="([^"]*)"/.exec(markup)?.[1]
const inputValueOf = (markup: string) => /<input[^>]*value="([^"]*)"/.exec(markup)?.[1]

describe('the empty prompt', () => {
  it('names the field as an action, keeping acronyms', () => {
    expect(emptyPrompt('Credit limit')).toBe('Set credit limit…')
    expect(emptyPrompt('Tax ID')).toBe('Set tax ID…')
  })
})

describe('integer', () => {
  it('empty shows the prompt, never a zero', () => {
    const markup = html(<IntegerField name="terms" label="Payment terms" value={null} />)
    expect(placeholderOf(markup)).toBe('Set payment terms…')
    expect(inputValueOf(markup) ?? '').toBe('')
    expect(placeholderOf(markup)).not.toMatch(/\d/)
  })

  it('a real zero shows as 0', () => {
    const markup = html(<IntegerField name="terms" label="Payment terms" value={0} />)
    expect(inputValueOf(markup)).toBe('0')
  })

  it('read-only: empty is a muted dash, zero is 0', () => {
    expect(html(<IntegerField name="t" label="Payment terms" value={null} readOnly />)).toContain('—')
    const zero = html(<IntegerField name="t" label="Payment terms" value={0} readOnly />)
    expect(zero).not.toContain('—')
    expect(zero).toMatch(/>0</)
  })

  it('list cell: empty is a dash, zero is 0', () => {
    expect(html(<IntegerListCell value={null} />)).toContain('—')
    const zero = html(<IntegerListCell value={0} />)
    expect(zero).not.toContain('—')
    expect(zero).toMatch(/>0</)
  })
})

describe('currency', () => {
  it('empty shows the prompt with no amount and no currency symbol', () => {
    const markup = html(<CurrencyField name="limit" label="Credit limit" value={null} maxDigits={14} />)
    expect(placeholderOf(markup)).toBe('Set credit limit…')
    expect(placeholderOf(markup)).not.toMatch(/\d/)
    expect(markup).not.toContain('amount-input__symbol')
    expect(markup).toContain('amount-input--empty')
  })

  it('a real zero shows the amount with its symbol', () => {
    const markup = html(<CurrencyField name="limit" label="Credit limit" value="0" maxDigits={14} />)
    expect(inputValueOf(markup)).toBe('0.00')
    expect(markup).toContain('amount-input__symbol')
    expect(markup).not.toContain('amount-input--empty')
  })

  it('read-only and list cell: empty is a dash, zero is Rs 0.00', () => {
    expect(html(<CurrencyField name="l" label="Credit limit" value={null} maxDigits={14} readOnly />)).toContain('—')
    expect(html(<CurrencyListCell value={null} />)).toContain('—')
    for (const zero of [
      html(<CurrencyField name="l" label="Credit limit" value="0" maxDigits={14} readOnly />),
      html(<CurrencyListCell value="0" />),
    ]) {
      expect(zero).not.toContain('—')
      expect(zero).toContain('Rs')
      expect(zero).toMatch(/>0</)
    }
  })
})

describe('date', () => {
  it('empty shows the prompt, never a date', () => {
    const markup = html(<DateField name="since" label="Customer since" value={null} />)
    expect(placeholderOf(markup)).toBe('Set customer since…')
  })
})
