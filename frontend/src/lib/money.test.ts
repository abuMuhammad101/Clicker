import { afterEach, describe, expect, it } from 'vitest'
import { aggregateDisplay } from '@/fields/aggregateDisplay'
import { formatDecimal, formatMoney, formatMoneyCompact, groupThousands, parseDecimalText } from './money'
import { organisation, setOrganisation } from './organisation'

const original = organisation()
afterEach(() => setOrganisation(original))

describe('lakh grouping', () => {
  it('groups the last three digits, then pairs', () => {
    expect(groupThousands('0')).toBe('0')
    expect(groupThousands('999')).toBe('999')
    expect(groupThousands('1000')).toBe('1,000')
    expect(groupThousands('420000')).toBe('4,20,000')
    expect(groupThousands('1248500')).toBe('12,48,500')
    expect(groupThousands('31332000000')).toBe('31,33,20,00,000')
  })

  it('one formatter writes every money amount', () => {
    expect(formatMoney('420000')).toBe('Rs 4,20,000.00')
    expect(formatMoney('-1248500.5')).toBe('−Rs 12,48,500.50')
    expect(formatMoney('0')).toBe('Rs 0.00')
    expect(formatDecimal('1234567.891', 2)).toBe('12,34,567.89')
  })

  it('falls back to threes when the organisation counts that way', () => {
    setOrganisation({ ...original, currency: { ...original.currency, grouping: 'western' } })
    expect(formatMoney('420000')).toBe('Rs 420,000.00')
    expect(groupThousands('1248500')).toBe('1,248,500')
  })

  it('accepts either style typed in, and stores the same decimal', () => {
    expect(parseDecimalText('Rs 4,20,000.50')).toBe('420000.50')
    expect(parseDecimalText('420,000.50')).toBe('420000.50')
    expect(parseDecimalText('420000.50')).toBe('420000.50')
    expect(parseDecimalText('12,48,500')).toBe('1248500')
    expect(parseDecimalText('abc')).toBeNull()
  })
})

describe('aggregate display rule', () => {
  it('never shows paisa on a total; the exact figure is the tooltip', () => {
    const crore = aggregateDisplay('currency', '3133250000.47')
    expect(crore.short).toBe('Rs 313 crore')
    expect(crore.exact).toBe('Rs 3,13,32,50,000.47')
    expect(aggregateDisplay('currency', '1450000.00').short).toBe('Rs 14.5 lakh')
    expect(aggregateDisplay('currency', '1400000.00').short).toBe('Rs 14 lakh')
    expect(aggregateDisplay('currency', '45300.75').short).toBe('Rs 45,301')
    expect(formatMoneyCompact('45300.75')).not.toContain('.75')
  })

  it('counts read with the same grouping', () => {
    expect(aggregateDisplay('integer', '1234567').short).toBe('12,34,567')
  })
})
