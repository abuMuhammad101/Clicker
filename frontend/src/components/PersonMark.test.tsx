import { describe, expect, it } from 'vitest'
import { initials } from './PersonMark'

describe('initials', () => {
  it('takes the first and last name', () => {
    expect(initials('Farhan Raza')).toBe('FR')
    expect(initials('Muhammad Ali Jinnah')).toBe('MJ')
  })

  it('takes one letter from one name', () => {
    expect(initials('Ayesha')).toBe('A')
  })

  it('never makes an initial of punctuation or a bracket', () => {
    expect(initials('Zainab Qureshi (demo)')).toBe('ZQ')
    expect(initials('— ')).toBe('')
  })
})
